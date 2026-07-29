import CryptoKit
import Foundation
import Security

let arguments = CommandLine.arguments
guard arguments.count == 3 else { fatalError("usage: macos-human-signer <identity|sign|delete> <tag>") }
let command = arguments[1]
let tag = arguments[2]
guard !tag.isEmpty else { fatalError("key-tag-required") }

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

func emit(_ value: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(value), let data = try? JSONSerialization.data(withJSONObject: value) else { fail("json-encode-failed") }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

let tagData = Data(tag.utf8)

func loadOrCreateKey() -> SecKey {
    let query: [String: Any] = [
        kSecClass as String: kSecClassKey,
        kSecAttrApplicationTag as String: tagData,
        kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
        kSecReturnRef as String: true
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecSuccess { return item as! SecKey }
    if status != errSecItemNotFound { fail("keychain-load-failed-\(status)") }
    let attributes: [String: Any] = [
        kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits as String: 256,
        kSecPrivateKeyAttrs as String: [
            kSecAttrIsPermanent as String: true,
            kSecAttrApplicationTag as String: tagData
        ]
    ]
    var error: Unmanaged<CFError>?
    guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
        fail((error?.takeRetainedValue() as Error?)?.localizedDescription ?? "keychain-key-generation-failed")
    }
    return key
}

func publicSpki(for privateKey: SecKey) -> Data {
    guard let publicKey = SecKeyCopyPublicKey(privateKey), let external = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? else { fail("public-key-export-failed") }
    let prefix = Data([0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01, 0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00])
    return prefix + external
}

func keyMetadata(for privateKey: SecKey) -> [String: Any] {
    let spki = publicSpki(for: privateKey)
    let digest = SHA256.hash(data: spki)
    return [
        "public_key_spki_base64": spki.base64EncodedString(),
        "public_key_fingerprint": digest.map { String(format: "%02x", $0) }.joined()
    ]
}

switch command {
case "identity":
    emit(keyMetadata(for: loadOrCreateKey()))
case "sign":
    let input = FileHandle.standardInput.readDataToEndOfFile()
    guard let object = try? JSONSerialization.jsonObject(with: input) as? [String: Any], let encoded = object["payload_base64"] as? String, let payload = Data(base64Encoded: encoded) else { fail("sign-payload-invalid") }
    let key = loadOrCreateKey()
    var error: Unmanaged<CFError>?
    guard let signature = SecKeyCreateSignature(key, SecKeyAlgorithm.ecdsaSignatureMessageX962SHA256, payload as CFData, &error) as Data? else {
        fail((error?.takeRetainedValue() as Error?)?.localizedDescription ?? "keychain-sign-failed")
    }
    var result = keyMetadata(for: key)
    result["signature_base64"] = signature.base64EncodedString()
    emit(result)
case "delete":
    let query: [String: Any] = [kSecClass as String: kSecClassKey, kSecAttrApplicationTag as String: tagData, kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom]
    let status = SecItemDelete(query as CFDictionary)
    if status != errSecSuccess && status != errSecItemNotFound { fail("keychain-delete-failed-\(status)") }
    emit(["deleted": true])
default:
    fail("unsupported-command")
}
