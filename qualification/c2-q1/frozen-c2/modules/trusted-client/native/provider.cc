// C2 platform source. No production eligibility claim without OS caller-isolation evidence.
#include <node_api.h>
#include <string>
#include <vector>
#include <cstring>
#ifdef _WIN32
#include <windows.h>
#include <ncrypt.h>
#include <bcrypt.h>
#endif
#ifdef __APPLE__
#include <Security/Security.h>
#include <CoreFoundation/CoreFoundation.h>
#endif
static napi_value fail(napi_env e,const char* code){napi_throw_error(e,code,code);return nullptr;}
static napi_value str(napi_env e,const std::string& s){napi_value v;napi_create_string_utf8(e,s.c_str(),s.size(),&v);return v;}
static void set(napi_env e,napi_value o,const char* k,napi_value v){napi_set_named_property(e,o,k,v);}
static napi_value boolean(napi_env e,bool b){napi_value v;napi_get_boolean(e,b,&v);return v;}
static napi_value nil(napi_env e){napi_value v;napi_get_null(e,&v);return v;}
static std::string b64(const std::vector<unsigned char>& v){static const char* a="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";std::string s;unsigned acc=0;int bits=0;for(auto x:v){acc=(acc<<8)|x;bits+=8;while(bits>=6){bits-=6;s+=a[(acc>>bits)&63];}}if(bits)s+=a[(acc<<(6-bits))&63];return s;}
static const unsigned char prefix[]={0x30,0x59,0x30,0x13,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,0x03,0x42,0x00};
static bool envelope(const unsigned char* b,size_t n){const std::string pre("VCP-HUMAN-CLIENT\0v1\0",20);const char* purposes[]={"enrollment-claim","capability-mint","channel-upgrade","self-revoke","session-authenticate"};for(auto p:purposes){std::string h=pre+p+std::string(1,'\0');if(n==h.size()+32&&memcmp(b,h.data(),h.size())==0)return true;}return false;}
#ifdef _WIN32
static const wchar_t* keyName=L"VCPChat.TrustedClient.C2";
struct Key{NCRYPT_PROV_HANDLE p=0;NCRYPT_KEY_HANDLE k=0;~Key(){if(k)NCryptFreeObject(k);if(p)NCryptFreeObject(p);}bool open(){return NCryptOpenStorageProvider(&p,MS_PLATFORM_CRYPTO_PROVIDER,0)==0&&NCryptOpenKey(p,&k,keyName,0,0)==0;}};
static bool publicBytes(Key& k,std::vector<unsigned char>& out){DWORD n=0;if(NCryptExportKey(k.k,0,BCRYPT_ECCPUBLIC_BLOB,nullptr,nullptr,0,&n,0))return false;std::vector<unsigned char>b(n);if(NCryptExportKey(k.k,0,BCRYPT_ECCPUBLIC_BLOB,nullptr,b.data(),n,&n,0)||n!=sizeof(BCRYPT_ECCKEY_BLOB)+64)return false;auto* h=(BCRYPT_ECCKEY_BLOB*)b.data();if(h->dwMagic!=BCRYPT_ECDSA_PUBLIC_P256_MAGIC||h->cbKey!=32)return false;out.assign(prefix,prefix+sizeof(prefix));out.push_back(4);out.insert(out.end(),b.begin()+sizeof(*h),b.end());return true;}
#endif
#ifdef __APPLE__
static CFDataRef tag(){const char* s="com.vcp.chatdesktop.trusted-client.c2";return CFDataCreate(nullptr,(const UInt8*)s,strlen(s));}
static SecKeyRef openKey(){CFDataRef t=tag();const void* ks[]={kSecClass,kSecAttrApplicationTag,kSecAttrKeyType,kSecReturnRef};const void* vs[]={kSecClassKey,t,kSecAttrKeyTypeECSECPrimeRandom,kCFBooleanTrue};CFDictionaryRef q=CFDictionaryCreate(nullptr,ks,vs,4,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);CFTypeRef r=nullptr;OSStatus s=SecItemCopyMatching(q,&r);CFRelease(q);CFRelease(t);return s==errSecSuccess?(SecKeyRef)r:nullptr;}
static bool publicBytes(SecKeyRef key,std::vector<unsigned char>& out){SecKeyRef pub=SecKeyCopyPublicKey(key);if(!pub)return false;CFErrorRef err=nullptr;CFDataRef d=SecKeyCopyExternalRepresentation(pub,&err);CFRelease(pub);if(err)CFRelease(err);if(!d)return false;bool ok=CFDataGetLength(d)==65&&CFDataGetBytePtr(d)[0]==4;if(ok){out.assign(prefix,prefix+sizeof(prefix));out.insert(out.end(),CFDataGetBytePtr(d),CFDataGetBytePtr(d)+65);}CFRelease(d);return ok;}
#endif
static napi_value identity(napi_env e,napi_callback_info){std::vector<unsigned char> pub;
#ifdef _WIN32
Key k;if(!k.open())return nil(e);if(!publicBytes(k,pub))return fail(e,"KEY_INVALID");const char* type="WINDOWS_CNG_TPM";
#elif defined(__APPLE__)
SecKeyRef k=openKey();if(!k)return nil(e);bool ok=publicBytes(k,pub);CFRelease(k);if(!ok)return fail(e,"KEY_INVALID");const char* type="MACOS_SECURE_ENCLAVE";
#else
return nil(e);const char* type="UNAVAILABLE";
#endif
napi_value o;napi_create_object(e,&o);set(e,o,"publicKeySpki",str(e,b64(pub)));set(e,o,"publicKeyAlgorithm",str(e,"ECDSA_P256_SHA256"));set(e,o,"providerType",str(e,type));set(e,o,"providerKeyId",str(e,"VCPChat.TrustedClient.C2"));return o;}
static napi_value create(napi_env e,napi_callback_info i){
// No platform caller-isolation evidence is admitted in this source candidate.
return fail(e,"PROVIDER_NOT_ADMITTED");
#ifdef _WIN32
Key k;if(k.open())return fail(e,"IDENTITY_EXISTS");if(!k.p)return fail(e,"PROVIDER_UNAVAILABLE");if(NCryptCreatePersistedKey(k.p,&k.k,NCRYPT_ECDSA_P256_ALGORITHM,keyName,0,0))return fail(e,"KEY_CREATE_FAILED");DWORD exportPolicy=0,usage=NCRYPT_ALLOW_SIGNING_FLAG;if(NCryptSetProperty(k.k,NCRYPT_EXPORT_POLICY_PROPERTY,(PBYTE)&exportPolicy,sizeof(exportPolicy),NCRYPT_PERSIST_FLAG)||NCryptSetProperty(k.k,NCRYPT_KEY_USAGE_PROPERTY,(PBYTE)&usage,sizeof(usage),NCRYPT_PERSIST_FLAG)||NCryptFinalizeKey(k.k,0))return fail(e,"KEY_POLICY_FAILED");return identity(e,i);
#elif defined(__APPLE__)
SecKeyRef old=openKey();if(old){CFRelease(old);return fail(e,"IDENTITY_EXISTS");}CFDataRef t=tag();CFErrorRef error=nullptr;SecAccessControlRef ac=SecAccessControlCreateWithFlags(nullptr,kSecAttrAccessibleWhenUnlockedThisDeviceOnly,kSecAccessControlPrivateKeyUsage,&error);if(!ac){CFRelease(t);if(error)CFRelease(error);return fail(e,"KEY_POLICY_FAILED");}const void* pk[]={kSecAttrIsPermanent,kSecAttrApplicationTag,kSecAttrAccessControl};const void* pv[]={kCFBooleanTrue,t,ac};CFDictionaryRef priv=CFDictionaryCreate(nullptr,pk,pv,3,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);int bits=256;CFNumberRef size=CFNumberCreate(nullptr,kCFNumberIntType,&bits);const void* ks[]={kSecAttrKeyType,kSecAttrKeySizeInBits,kSecAttrTokenID,kSecPrivateKeyAttrs};const void* vs[]={kSecAttrKeyTypeECSECPrimeRandom,size,kSecAttrTokenIDSecureEnclave,priv};CFDictionaryRef attrs=CFDictionaryCreate(nullptr,ks,vs,4,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);SecKeyRef key=SecKeyCreateRandomKey(attrs,&error);CFRelease(attrs);CFRelease(size);CFRelease(priv);CFRelease(ac);CFRelease(t);if(error)CFRelease(error);if(!key)return fail(e,"KEY_CREATE_FAILED");CFRelease(key);return identity(e,i);
#else
return fail(e,"PROVIDER_UNAVAILABLE");
#endif
}
static napi_value signProof(napi_env e,napi_callback_info info){size_t argc=1;napi_value arg;bool isBuffer=false;napi_get_cb_info(e,info,&argc,&arg,nullptr,nullptr);if(argc!=1)return fail(e,"PROOF_INVALID");napi_is_buffer(e,arg,&isBuffer);if(!isBuffer)return fail(e,"PROOF_INVALID");void* p;size_t n;napi_get_buffer_info(e,arg,&p,&n);if(!envelope((unsigned char*)p,n))return fail(e,"PROOF_INVALID");
// Direct addon invocation cannot bypass the Main production gate.
return fail(e,"PROVIDER_NOT_ADMITTED");std::vector<unsigned char> signature;const char* format="P1363";
#ifdef _WIN32
Key k;if(!k.open())return fail(e,"KEY_LOST");BCRYPT_ALG_HANDLE alg;BCRYPT_HASH_HANDLE hash;DWORD objLen=0,got=0;unsigned char digest[32];if(BCryptOpenAlgorithmProvider(&alg,BCRYPT_SHA256_ALGORITHM,nullptr,0))return fail(e,"CRYPTO_ERROR");if(BCryptGetProperty(alg,BCRYPT_OBJECT_LENGTH,(PUCHAR)&objLen,sizeof(objLen),&got,0)){BCryptCloseAlgorithmProvider(alg,0);return fail(e,"CRYPTO_ERROR");}std::vector<unsigned char> obj(objLen);if(BCryptCreateHash(alg,&hash,obj.data(),objLen,nullptr,0,0)){BCryptCloseAlgorithmProvider(alg,0);return fail(e,"CRYPTO_ERROR");}auto status=BCryptHashData(hash,(PUCHAR)p,(ULONG)n,0);if(!status)status=BCryptFinishHash(hash,digest,32,0);BCryptDestroyHash(hash);BCryptCloseAlgorithmProvider(alg,0);if(status)return fail(e,"CRYPTO_ERROR");DWORD count=0;if(NCryptSignHash(k.k,nullptr,digest,32,nullptr,0,&count,0)||count!=64)return fail(e,"SIGN_FAILED");signature.resize(count);if(NCryptSignHash(k.k,nullptr,digest,32,signature.data(),count,&count,0))return fail(e,"SIGN_FAILED");
#elif defined(__APPLE__)
SecKeyRef key=openKey();if(!key)return fail(e,"KEY_LOST");CFDataRef message=CFDataCreate(nullptr,(UInt8*)p,n);CFErrorRef err=nullptr;CFDataRef s=SecKeyCreateSignature(key,kSecKeyAlgorithmECDSASignatureMessageX962SHA256,message,&err);CFRelease(message);CFRelease(key);if(err)CFRelease(err);if(!s)return fail(e,"SIGN_FAILED");signature.assign(CFDataGetBytePtr(s),CFDataGetBytePtr(s)+CFDataGetLength(s));CFRelease(s);format="DER";
#else
return fail(e,"PROVIDER_UNAVAILABLE");
#endif
napi_value out,bytes;napi_create_object(e,&out);napi_create_buffer_copy(e,signature.size(),signature.data(),nullptr,&bytes);set(e,out,"bytes",bytes);set(e,out,"format",str(e,format));return out;}
static napi_value properties(napi_env e,napi_callback_info){napi_value o;napi_create_object(e,&o);set(e,o,"KeyExtractionProtection",str(e,"UNKNOWN"));set(e,o,"KeyInvocationIsolation",str(e,"UNKNOWN"));set(e,o,"productionEligible",boolean(e,false));set(e,o,"reason",str(e,"Independent platform runtime/caller isolation admission required; C2 source is PRODUCTION_DISABLED"));return o;}
// Provider-adjacent non-secret locator. This is not admission authority or key material.
static napi_value readDescriptor(napi_env e,napi_callback_info){
#ifdef _WIN32
Key k;if(!k.open())return nil(e);DWORD n=0;auto status=NCryptGetProperty(k.k,L"VCPChat.C2.Descriptor",nullptr,0,&n,NCRYPT_PERSIST_ONLY_FLAG);if(status==NTE_NOT_FOUND)return nil(e);if(status||n>8192)return fail(e,"DESCRIPTOR_UNAVAILABLE");std::vector<unsigned char>b(n);if(NCryptGetProperty(k.k,L"VCPChat.C2.Descriptor",b.data(),n,&n,NCRYPT_PERSIST_ONLY_FLAG))return fail(e,"DESCRIPTOR_UNAVAILABLE");return str(e,std::string((char*)b.data(),n));
#elif defined(__APPLE__)
const void* ks[]={kSecClass,kSecAttrService,kSecAttrAccount,kSecReturnData};const void* vs[]={kSecClassGenericPassword,CFSTR("com.vcp.chatdesktop.trusted-client.c2"),CFSTR("descriptor"),kCFBooleanTrue};CFDictionaryRef q=CFDictionaryCreate(nullptr,ks,vs,4,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);CFTypeRef data=nullptr;OSStatus status=SecItemCopyMatching(q,&data);CFRelease(q);if(status==errSecItemNotFound)return nil(e);if(status!=errSecSuccess)return fail(e,"DESCRIPTOR_UNAVAILABLE");CFDataRef d=(CFDataRef)data;std::string json((char*)CFDataGetBytePtr(d),CFDataGetLength(d));CFRelease(d);if(json.size()>8192)return fail(e,"DESCRIPTOR_UNAVAILABLE");return str(e,json);
#else
return nil(e);
#endif
}
static napi_value writeDescriptor(napi_env e,napi_callback_info info){return fail(e,"PROVIDER_NOT_ADMITTED");size_t count=1;napi_value arg;size_t n=0;napi_get_cb_info(e,info,&count,&arg,nullptr,nullptr);if(count!=1||napi_get_value_string_utf8(e,arg,nullptr,0,&n)!=napi_ok||n>8192)return fail(e,"DESCRIPTOR_INVALID");std::vector<char>b(n+1);napi_get_value_string_utf8(e,arg,b.data(),b.size(),&n);
#ifdef _WIN32
Key k;if(!k.open())return fail(e,"KEY_LOST");if(NCryptSetProperty(k.k,L"VCPChat.C2.Descriptor",(PBYTE)b.data(),(DWORD)n,NCRYPT_PERSIST_FLAG))return fail(e,"DESCRIPTOR_WRITE_FAILED");return boolean(e,true);
#elif defined(__APPLE__)
SecKeyRef k=openKey();if(!k)return fail(e,"KEY_LOST");CFRelease(k);CFDataRef d=CFDataCreate(nullptr,(UInt8*)b.data(),n);const void* ks[]={kSecClass,kSecAttrService,kSecAttrAccount,kSecAttrAccessible,kSecValueData};const void* vs[]={kSecClassGenericPassword,CFSTR("com.vcp.chatdesktop.trusted-client.c2"),CFSTR("descriptor"),kSecAttrAccessibleWhenUnlockedThisDeviceOnly,d};CFDictionaryRef q=CFDictionaryCreate(nullptr,ks,vs,5,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);OSStatus status=SecItemAdd(q,nullptr);CFRelease(q);if(status==errSecDuplicateItem){const void* qk[]={kSecClass,kSecAttrService,kSecAttrAccount};const void* qv[]={kSecClassGenericPassword,CFSTR("com.vcp.chatdesktop.trusted-client.c2"),CFSTR("descriptor")};q=CFDictionaryCreate(nullptr,qk,qv,3,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);const void* uk[]={kSecValueData};const void* uv[]={d};CFDictionaryRef u=CFDictionaryCreate(nullptr,uk,uv,1,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);status=SecItemUpdate(q,u);CFRelease(u);CFRelease(q);}CFRelease(d);if(status!=errSecSuccess)return fail(e,"DESCRIPTOR_WRITE_FAILED");return boolean(e,true);
#else
return fail(e,"PROVIDER_UNAVAILABLE");
#endif
}
static napi_value init(napi_env e,napi_value exports){napi_property_descriptor p[]={{"getIdentity",0,identity,0,0,0,napi_default,0},{"createIdentity",0,create,0,0,0,napi_default,0},{"signHumanClientProtocolProof",0,signProof,0,0,0,napi_default,0},{"getSecurityProperties",0,properties,0,0,0,napi_default,0},{"readDescriptor",0,readDescriptor,0,0,0,napi_default,0},{"writeDescriptor",0,writeDescriptor,0,0,0,napi_default,0}};napi_define_properties(e,exports,sizeof(p)/sizeof(p[0]),p);return exports;}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
