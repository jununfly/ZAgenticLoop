import Foundation
import Security
import Darwin
import CryptoKit

let responseSchema = "zj-loop.macos_process_audit_peer_identity.v1"

struct Response: Codable {
    let schema: String
    let status: String
    let process_id: Int32?
    let identity_digest: String?
    let signing_identifier: String?
    let team_identifier: String?
    let code_directory_hash: String?
    let reason: String?
}

func emit(_ response: Response) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    FileHandle.standardOutput.write((try! encoder.encode(response)) + Data("\n".utf8))
}

func blocked(_ reason: String) -> Never {
    emit(Response(schema: responseSchema, status: "blocked", process_id: nil, identity_digest: nil, signing_identifier: nil, team_identifier: nil, code_directory_hash: nil, reason: reason))
    exit(0)
}

func digest(_ value: Data) -> String { "sha256:" + SHA256.hash(data: value).map { String(format: "%02x", $0) }.joined() }

func stringValue(_ dictionary: CFDictionary, _ key: CFString) -> String? {
    let values = dictionary as NSDictionary
    return values[key as String] as? String
}

func codeDirectoryHash(_ dictionary: CFDictionary, identifier: String, team: String?) -> String {
    let values = dictionary as NSDictionary
    if let hash = values[kSecCodeInfoUnique as String] as? Data { return hash.base64EncodedString() }
    return digest(Data("\(identifier)|\(team ?? "")".utf8))
}

func processIdentity(_ pid: pid_t) -> (String, String?, String)? {
    var pathBuffer = [CChar](repeating: 0, count: 4096)
    guard proc_pidpath(pid, &pathBuffer, UInt32(pathBuffer.count)) > 0 else { return nil }
    let codePath = URL(fileURLWithPath: String(cString: pathBuffer)) as CFURL
    var staticCode: SecStaticCode?
    guard SecStaticCodeCreateWithPath(codePath, [], &staticCode) == errSecSuccess, let staticCode else { return nil }
    guard SecStaticCodeCheckValidity(staticCode, [], nil) == errSecSuccess else { return nil }
    var information: CFDictionary?
    guard SecCodeCopySigningInformation(staticCode, SecCSFlags(), &information) == errSecSuccess, let information else { return nil }
    guard let identifier = stringValue(information, kSecCodeInfoIdentifier) else { return nil }
    let team = stringValue(information, kSecCodeInfoTeamIdentifier)
    return (identifier, team, codeDirectoryHash(information, identifier: identifier, team: team))
}

let peerPid: pid_t
if CommandLine.arguments.count == 3, CommandLine.arguments[1] == "--socket-fd", let fd = Int32(CommandLine.arguments[2]), fd >= 0 {
    var socketPid: pid_t = 0
    var length = socklen_t(MemoryLayout<pid_t>.size)
    guard getsockopt(fd, SOL_LOCAL, LOCAL_PEERPID, &socketPid, &length) == 0, socketPid > 0 else { blocked("macos-process-audit-peer-pid-unavailable") }
    peerPid = socketPid
} else if CommandLine.arguments.count == 3, CommandLine.arguments[1] == "--pid", let pid = pid_t(CommandLine.arguments[2]), pid > 0 {
    peerPid = pid
} else {
    blocked("macos-process-audit-arguments-invalid")
}
guard let (identifier, team, cdHash) = processIdentity(peerPid) else { blocked("macos-process-audit-signing-identity-unavailable") }
let material: [String: Any?] = ["code_directory_hash": cdHash, "process_id": peerPid, "signing_identifier": identifier, "team_identifier": team]
let materialData = try! JSONSerialization.data(withJSONObject: material.compactMapValues { $0 }, options: [.sortedKeys, .withoutEscapingSlashes])
emit(Response(schema: responseSchema, status: "verified", process_id: peerPid, identity_digest: digest(materialData), signing_identifier: identifier, team_identifier: team, code_directory_hash: cdHash, reason: nil))
