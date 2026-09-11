import Foundation
import CryptoKit

// Disposable framework diagnostic only. No keychain entry, private-key export,
// signing endpoint, user-presence claim, or production identity is created.
var result: [String: Any] = [
    "api": "CryptoKit.SecureEnclave.P256.Signing.PrivateKey",
    "isAvailable": SecureEnclave.isAvailable,
    "productionEligible": false,
    "humanInputProvenance": "UNPROVEN",
    "persistentIdentityCreated": false
]
do {
    let key = try SecureEnclave.P256.Signing.PrivateKey()
    result["keyCreation"] = "PASS"
    result["publicKeyFingerprint"] = SHA256.hash(data: key.publicKey.derRepresentation)
        .map { String(format: "%02x", $0) }.joined()
    result["keyExtractionProtection"] = "UNPROVEN"
    result["keyInvocationIsolation"] = "UNPROVEN"
    // Key reference dies at scope exit. No encrypted handle or key material persisted.
} catch {
    let failure = error as NSError
    result["keyCreation"] = "UNPROVEN"
    result["errorDomain"] = failure.domain
    result["errorCode"] = failure.code
}
let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
print(String(decoding: data, as: UTF8.self))
