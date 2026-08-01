import CryptoKit
import Darwin
import Foundation
import Security

struct Request: Codable {
    let schema: String
    let key_tag: String
    let runner_id: String
    let execution_id: String
    let attempt: Int
    let preflight_digest: String
    let proof_digest: String
    let registry_snapshot_digest: String
    let argv: [String]
    let timeout_ms: Int
    let termination_grace_ms: Int
}

struct Signature: Codable {
    let algorithm: String
    let public_key_pem: String
    let public_key_fingerprint: String
    let signature_base64: String
}

struct ProcessBoundary: Codable {
    let kind: String
    let process_group_id: Int32
    let job_object_id: String?
    let child_process_count: Int
    let all_descendants_terminated: Bool
    let termination_sequence_digest: String
    let orphan_processes_detected: Bool
    let unknown_descendants_detected: Bool
}

struct Observation: Codable {
    let schema: String
    let status: String
    let runner_id: String
    let execution_id: String
    let attempt: Int
    let preflight_digest: String
    let proof_digest: String
    let registry_snapshot_digest: String
    let exit_code: Int32?
    let signal: Int32?
    let stdout: String
    let stderr: String
    let stdout_digest: String
    let stderr_digest: String
    let stdout_bytes: Int
    let stderr_bytes: Int
    let output_truncated: Bool
    let process_boundary: ProcessBoundary
    let signature: Signature?
}

let observationSchema = "zj-loop.macos_trusted_runner_observation.v1"
let inputData = FileHandle.standardInput.readDataToEndOfFile()
if let raw = try? JSONSerialization.jsonObject(with: inputData) as? [String: Any], raw["command"] as? String == "delete" {
    guard let tag = raw["key_tag"] as? String, !tag.isEmpty else { fatalError("trusted-runner-key-tag-required") }
    let query: [String: Any] = [kSecClass as String: kSecClassKey, kSecAttrApplicationTag as String: Data(tag.utf8), kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom]
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else { fatalError("trusted-runner-keychain-delete-failed-\(status)") }
    FileHandle.standardOutput.write(Data("{\"deleted\":true}\n".utf8))
    exit(0)
}
let request = try JSONDecoder().decode(Request.self, from: inputData)
guard request.schema == "zj-loop.macos_trusted_runner_request.v1",
      !request.key_tag.isEmpty,
      !request.argv.isEmpty,
      request.timeout_ms > 0,
      request.termination_grace_ms > 0 else {
    fatalError("trusted-runner-request-invalid")
}

func digest(_ data: Data) -> String {
    "sha256:" + SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

let keyTagData = Data(request.key_tag.utf8)
func loadOrCreateKey() -> SecKey {
    let query: [String: Any] = [kSecClass as String: kSecClassKey, kSecAttrApplicationTag as String: keyTagData, kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom, kSecReturnRef as String: true]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecSuccess, let key = item { return key as! SecKey }
    guard status == errSecItemNotFound else { fatalError("trusted-runner-keychain-load-failed-\(status)") }
    let attributes: [String: Any] = [kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom, kSecAttrKeySizeInBits as String: 256, kSecPrivateKeyAttrs as String: [kSecAttrIsPermanent as String: true, kSecAttrApplicationTag as String: keyTagData]]
    var error: Unmanaged<CFError>?
    guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else { fatalError("trusted-runner-keychain-create-failed") }
    return key
}

func publicSpki(for privateKey: SecKey) -> Data {
    guard let publicKey = SecKeyCopyPublicKey(privateKey), let external = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? else { fatalError("trusted-runner-public-key-export-failed") }
    return Data([0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01, 0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00]) + external
}

func publicKeyPem(for spki: Data) -> String {
    let encoded = spki.base64EncodedString()
    var lines: [String] = []
    var index = encoded.startIndex
    while index < encoded.endIndex {
        let end = encoded.index(index, offsetBy: 64, limitedBy: encoded.endIndex) ?? encoded.endIndex
        lines.append(String(encoded[index..<end]))
        index = end
    }
    return "-----BEGIN PUBLIC KEY-----\n" + lines.joined(separator: "\n") + "\n-----END PUBLIC KEY-----\n"
}

func runnerSignature(for payload: Data, privateKey: SecKey) -> Signature {
    let spki = publicSpki(for: privateKey)
    var error: Unmanaged<CFError>?
    guard let signature = SecKeyCreateSignature(privateKey, SecKeyAlgorithm.ecdsaSignatureMessageX962SHA256, payload as CFData, &error) as Data? else { fatalError("trusted-runner-sign-failed") }
    return Signature(algorithm: "ECDSA-P256", public_key_pem: publicKeyPem(for: spki), public_key_fingerprint: digest(spki).dropFirst(7).description, signature_base64: signature.base64EncodedString())
}

func canonicalObservationPayload(_ observation: Observation) -> Data {
    var boundary: [String: Any] = ["kind": observation.process_boundary.kind, "process_group_id": observation.process_boundary.process_group_id, "child_process_count": observation.process_boundary.child_process_count, "all_descendants_terminated": observation.process_boundary.all_descendants_terminated, "termination_sequence_digest": observation.process_boundary.termination_sequence_digest, "orphan_processes_detected": observation.process_boundary.orphan_processes_detected, "unknown_descendants_detected": observation.process_boundary.unknown_descendants_detected]
    if let jobObject = observation.process_boundary.job_object_id { boundary["job_object_id"] = jobObject }
    var object: [String: Any] = [
        "schema": observation.schema, "status": observation.status, "runner_id": observation.runner_id, "execution_id": observation.execution_id, "attempt": observation.attempt, "preflight_digest": observation.preflight_digest, "proof_digest": observation.proof_digest, "registry_snapshot_digest": observation.registry_snapshot_digest, "stdout": observation.stdout, "stderr": observation.stderr,
        "stdout_digest": observation.stdout_digest, "stderr_digest": observation.stderr_digest, "stdout_bytes": observation.stdout_bytes, "stderr_bytes": observation.stderr_bytes, "output_truncated": observation.output_truncated,
        "process_boundary": boundary
    ]
    if let exitCode = observation.exit_code { object["exit_code"] = exitCode }
    if let signal = observation.signal { object["signal"] = signal }
    let encoded = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes])
    return encoded
}

func groupExists(_ group: Int32) -> Bool {
    if kill(-group, 0) == 0 { return true }
    return errno == EPERM
}

func waitForEmptyGroup(_ group: Int32, timeoutMs: Int) -> Bool {
    let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000.0)
    repeat {
        if !groupExists(group) { return true }
        usleep(10_000)
    } while Date() < deadline
    return !groupExists(group)
}

func terminateGroup(_ group: Int32, graceMs: Int) {
    _ = kill(-group, SIGTERM)
    if waitForEmptyGroup(group, timeoutMs: graceMs) { return }
    _ = kill(-group, SIGKILL)
}

let stdoutPipe = Pipe()
let stderrPipe = Pipe()

func withCStringArray<T>(_ values: [String], _ body: (UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>) -> T) -> T {
    var pointers = values.map { strdup($0) } + [nil]
    defer { pointers.dropLast().forEach { free($0) } }
    return pointers.withUnsafeMutableBufferPointer { body($0.baseAddress!) }
}

var fileActions: posix_spawn_file_actions_t?
posix_spawn_file_actions_init(&fileActions)
posix_spawn_file_actions_adddup2(&fileActions, stdoutPipe.fileHandleForWriting.fileDescriptor, STDOUT_FILENO)
posix_spawn_file_actions_adddup2(&fileActions, stderrPipe.fileHandleForWriting.fileDescriptor, STDERR_FILENO)
posix_spawn_file_actions_addclose(&fileActions, stdoutPipe.fileHandleForReading.fileDescriptor)
posix_spawn_file_actions_addclose(&fileActions, stderrPipe.fileHandleForReading.fileDescriptor)
var attributes: posix_spawnattr_t?
posix_spawnattr_init(&attributes)
posix_spawnattr_setflags(&attributes, Int16(POSIX_SPAWN_SETPGROUP))
posix_spawnattr_setpgroup(&attributes, 0)
var child: pid_t = 0
let spawnStatus = withCStringArray(request.argv) { arguments in
    posix_spawn(&child, arguments[0], &fileActions, &attributes, arguments, environ)
}
posix_spawnattr_destroy(&attributes)
posix_spawn_file_actions_destroy(&fileActions)
guard spawnStatus == 0 else { fatalError("trusted-runner-spawn-failed-\(spawnStatus)") }
try? stdoutPipe.fileHandleForWriting.close()
try? stderrPipe.fileHandleForWriting.close()
let group = child

let finished = DispatchSemaphore(value: 0)
var waitStatus: Int32 = 0
DispatchQueue.global(qos: .userInitiated).async {
    waitpid(child, &waitStatus, 0)
    finished.signal()
}

var status = "completed"
if finished.wait(timeout: .now() + .milliseconds(request.timeout_ms)) == .timedOut {
    status = "timed-out"
    terminateGroup(group, graceMs: request.termination_grace_ms)
    _ = finished.wait(timeout: .now() + .milliseconds(request.termination_grace_ms))
}

if groupExists(group) {
    terminateGroup(group, graceMs: request.termination_grace_ms)
    _ = finished.wait(timeout: .now() + .milliseconds(request.termination_grace_ms))
}

let stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
let maxOutputBytes = 1024 * 1024
let outputTruncated = stdoutData.count > maxOutputBytes || stderrData.count > maxOutputBytes
let boundedStdout = stdoutData.prefix(maxOutputBytes)
let boundedStderr = stderrData.prefix(maxOutputBytes)
let groupEmpty = waitForEmptyGroup(group, timeoutMs: request.termination_grace_ms)
let exitedNormally = (waitStatus & 0x7f) == 0
let terminatedBySignal = (waitStatus & 0x7f) != 0
let boundary = ProcessBoundary(
    kind: "process-group",
    process_group_id: group,
    job_object_id: nil,
    child_process_count: 1,
    all_descendants_terminated: groupEmpty,
    termination_sequence_digest: digest(Data("\(status):\(group)".utf8)),
    orphan_processes_detected: !groupEmpty,
    unknown_descendants_detected: false
)
let observation = Observation(
    schema: observationSchema,
    status: status,
    runner_id: request.runner_id,
    execution_id: request.execution_id,
    attempt: request.attempt,
    preflight_digest: request.preflight_digest,
    proof_digest: request.proof_digest,
    registry_snapshot_digest: request.registry_snapshot_digest,
    exit_code: exitedNormally ? ((waitStatus >> 8) & 0xff) : nil,
    signal: terminatedBySignal ? (waitStatus & 0x7f) : nil,
    stdout: String(decoding: boundedStdout, as: UTF8.self),
    stderr: String(decoding: boundedStderr, as: UTF8.self),
    stdout_digest: digest(stdoutData),
    stderr_digest: digest(stderrData),
    stdout_bytes: stdoutData.count,
    stderr_bytes: stderrData.count,
    output_truncated: outputTruncated,
    process_boundary: boundary,
    signature: nil
)
let privateKey = loadOrCreateKey()
let signedObservation = Observation(schema: observation.schema, status: observation.status, runner_id: observation.runner_id, execution_id: observation.execution_id, attempt: observation.attempt, preflight_digest: observation.preflight_digest, proof_digest: observation.proof_digest, registry_snapshot_digest: observation.registry_snapshot_digest, exit_code: observation.exit_code, signal: observation.signal, stdout: observation.stdout, stderr: observation.stderr, stdout_digest: observation.stdout_digest, stderr_digest: observation.stderr_digest, stdout_bytes: observation.stdout_bytes, stderr_bytes: observation.stderr_bytes, output_truncated: observation.output_truncated, process_boundary: observation.process_boundary, signature: runnerSignature(for: canonicalObservationPayload(observation), privateKey: privateKey))
let encoded = try JSONEncoder().encode(signedObservation)
FileHandle.standardOutput.write(encoded)
FileHandle.standardOutput.write(Data("\n".utf8))
