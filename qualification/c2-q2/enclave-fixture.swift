import Foundation
import CryptoKit

// Isolated fixture executable, never a provider endpoint or production signer.
// It can sign only the five pre-generated fixture entries, not caller-supplied bytes.
enum FixtureError: Error { case invalid }
let args = CommandLine.arguments
guard args.count >= 3 else { throw FixtureError.invalid }
let mode = args[1], root = URL(fileURLWithPath: args[2], isDirectory: true)
guard root.lastPathComponent.hasPrefix("c2-q2-enclave-") else { throw FixtureError.invalid }
let handle = root.appendingPathComponent("enclave-handle.bin")
let publicFile = root.appendingPathComponent("public.json")
func publish(_ fields: [String: Any]) throws {
    print(String(decoding: try JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys]), as: UTF8.self))
}
func identity(_ key: SecureEnclave.P256.Signing.PrivateKey) -> [String: Any] {
    return ["publicKeySpki": key.publicKey.derRepresentation.base64EncodedString(),
            "publicKeyFingerprint": SHA256.hash(data: key.publicKey.derRepresentation).map { String(format: "%02x", $0) }.joined(),
            "productionEligible": false]
}
if mode == "create" {
    guard !FileManager.default.fileExists(atPath: handle.path) else { throw FixtureError.invalid }
    let key = try SecureEnclave.P256.Signing.PrivateKey()
    // CryptoKit's opaque Secure Enclave representation is not a raw private scalar.
    // It stays only in this disposable runner fixture and is never uploaded or logged.
    try key.dataRepresentation.write(to: handle, options: [.atomic])
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: handle.path)
    try JSONSerialization.data(withJSONObject: identity(key), options: [.sortedKeys]).write(to: publicFile)
    try publish(identity(key))
} else if mode == "reopen" || mode == "sign-fixture" {
    let key = try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: Data(contentsOf: handle))
    if mode == "reopen" { try publish(identity(key)) }
    else {
        guard args.count == 4, let index = Int(args[3]), (0..<5).contains(index) else { throw FixtureError.invalid }
        let input = try Data(contentsOf: root.appendingPathComponent("five-proofs.json"))
        guard let proofs = try JSONSerialization.jsonObject(with: input) as? [[String: String]], proofs.count == 5 else { throw FixtureError.invalid }
        let purposes = ["enrollment-claim", "capability-mint", "channel-upgrade", "self-revoke", "session-authenticate"]
        let item = proofs[index]
        guard item["purpose"] == purposes[index], let encoded = item["signingInput"], let bytes = Data(base64Encoded: encoded) else { throw FixtureError.invalid }
        let prefix = Data(("VCP-HUMAN-CLIENT\0v1\0" + purposes[index] + "\0").utf8)
        guard bytes.count == prefix.count + 32, bytes.starts(with: prefix) else { throw FixtureError.invalid }
        let signature = try key.signature(for: bytes)
        try publish(["signatureP1363": signature.rawRepresentation.base64EncodedString(), "productionEligible": false])
    }
} else { throw FixtureError.invalid }
