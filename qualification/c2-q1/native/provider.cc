// C2 platform source. No production eligibility claim without OS caller-isolation evidence.
#include <node_api.h>
#include <string>
#include <vector>
#include <cstring>
#include <cctype>
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
static napi_value jsBoolean(napi_env e,bool b){napi_value v;napi_get_jsBoolean(e,b,&v);return v;}
static napi_value jsNull(napi_env e){napi_value v;napi_get_null(e,&v);return v;}
static std::string b64(const std::vector<unsigned char>& v){static const char* a="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";std::string s;unsigned acc=0;int bits=0;for(auto x:v){acc=(acc<<8)|x;bits+=8;while(bits>=6){bits-=6;s+=a[(acc>>bits)&63];}}if(bits)s+=a[(acc<<(6-bits))&63];return s;}
// Q1 successor is a separate test target. No production loader imports it.
static std::string qid; static bool diagnostic=false;
static napi_value qualificationInit(napi_env e,napi_callback_info info){
 size_t count=2; napi_value args[2];napi_get_cb_info(e,info,&count,args,nullptr,nullptr);
 if(count!=2||!qid.empty())return fail(e,"QUALIFICATION_INIT_INVALID");
 char idbuf[33],mode[24];size_t n=0,m=0;
 if(napi_get_value_string_utf8(e,args[0],nullptr,0,&n)!=napi_ok||n!=32||napi_get_value_string_utf8(e,args[1],nullptr,0,&m)!=napi_ok||m>=sizeof(mode))return fail(e,"QUALIFICATION_INIT_INVALID");
 if(napi_get_value_string_utf8(e,args[0],idbuf,sizeof(idbuf),&n)!=napi_ok||n!=32||napi_get_value_string_utf8(e,args[1],mode,sizeof(mode),&m)!=napi_ok)return fail(e,"QUALIFICATION_INIT_INVALID");
 for(size_t i=0;i<n;i++)if(!((idbuf[i]>='0'&&idbuf[i]<='9')||(idbuf[i]>='a'&&idbuf[i]<='f')))return fail(e,"QUALIFICATION_INIT_INVALID");
 std::string policy(mode,m);if(policy!="TARGET"&&policy!="SOFTWARE_DIAGNOSTIC")return fail(e,"QUALIFICATION_INIT_INVALID");
 qid=std::string(idbuf,n);diagnostic=policy=="SOFTWARE_DIAGNOSTIC";return jsBoolean(e,true);
}
#ifdef __APPLE__
static CFStringRef serviceName(){static CFStringRef value=CFStringCreateWithCString(nullptr,("com.vcp.qualification.q1."+qid).c_str(),kCFStringEncodingUTF8);return value;}
#endif
static const unsigned char prefix[]={0x30,0x59,0x30,0x13,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,0x03,0x42,0x00};
static bool envelope(const unsigned char* b,size_t n){const std::string pre("VCP-HUMAN-CLIENT\0v1\0",20);const char* purposes[]={"enrollment-claim","capability-mint","channel-upgrade","self-revoke","session-authenticate"};for(auto p:purposes){std::string h=pre+p+std::string(1,'\0');if(n==h.size()+32&&memcmp(b,h.data(),h.size())==0)return true;}return false;}
#ifdef _WIN32
static std::wstring keyName(){return L"VCPChat.Qualification.Q1."+std::wstring(qid.begin(),qid.end());}
struct Key{NCRYPT_PROV_HANDLE p=0;NCRYPT_KEY_HANDLE k=0;~Key(){if(k)NCryptFreeObject(k);if(p)NCryptFreeObject(p);}bool open(){return NCryptOpenStorageProvider(&p,(diagnostic?MS_KEY_STORAGE_PROVIDER:MS_PLATFORM_CRYPTO_PROVIDER),0)==0&&NCryptOpenKey(p,&k,keyName().c_str(),0,0)==0;}};
static bool publicBytes(Key& k,std::vector<unsigned char>& out){DWORD n=0;if(NCryptExportKey(k.k,0,BCRYPT_ECCPUBLIC_BLOB,nullptr,nullptr,0,&n,0))return false;std::vector<unsigned char>b(n);if(NCryptExportKey(k.k,0,BCRYPT_ECCPUBLIC_BLOB,nullptr,b.data(),n,&n,0)||n!=sizeof(BCRYPT_ECCKEY_BLOB)+64)return false;auto* h=(BCRYPT_ECCKEY_BLOB*)b.data();if(h->dwMagic!=BCRYPT_ECDSA_PUBLIC_P256_MAGIC||h->cbKey!=32)return false;out.assign(prefix,prefix+sizeof(prefix));out.push_back(4);out.insert(out.end(),b.begin()+sizeof(*h),b.end());return true;}
#endif
#ifdef __APPLE__
static CFDataRef tag(){const std::string s="com.vcp.qualification.q1."+qid;return CFDataCreate(nullptr,(const UInt8*)s.data(),s.size());}
static SecKeyRef openKey(){CFDataRef t=tag();const void* ks[]={kSecClass,kSecAttrApplicationTag,kSecAttrKeyType,kSecReturnRef};const void* vs[]={kSecClassKey,t,kSecAttrKeyTypeECSECPrimeRandom,kCFBooleanTrue};CFDictionaryRef q=CFDictionaryCreate(nullptr,ks,vs,4,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);CFTypeRef r=nullptr;OSStatus s=SecItemCopyMatching(q,&r);CFRelease(q);CFRelease(t);return s==errSecSuccess?(SecKeyRef)r:nullptr;}
static bool publicBytes(SecKeyRef key,std::vector<unsigned char>& out){SecKeyRef pub=SecKeyCopyPublicKey(key);if(!pub)return false;CFErrorRef err=nullptr;CFDataRef d=SecKeyCopyExternalRepresentation(pub,&err);CFRelease(pub);if(err)CFRelease(err);if(!d)return false;bool ok=CFDataGetLength(d)==65&&CFDataGetBytePtr(d)[0]==4;if(ok){out.assign(prefix,prefix+sizeof(prefix));out.insert(out.end(),CFDataGetBytePtr(d),CFDataGetBytePtr(d)+65);}CFRelease(d);return ok;}
#endif
static napi_value identity(napi_env e,napi_callback_info){if(qid.empty())return jsNull(e);std::vector<unsigned char> pub;
#ifdef _WIN32
Key k;if(!k.open())return jsNull(e);if(!publicBytes(k,pub))return fail(e,"KEY_INVALID");const char* type=(diagnostic?"QUALIFICATION_WINDOWS_SOFTWARE":"QUALIFICATION_WINDOWS_TPM");
#elif defined(__APPLE__)
SecKeyRef k=openKey();if(!k)return jsNull(e);bool ok=publicBytes(k,pub);CFRelease(k);if(!ok)return fail(e,"KEY_INVALID");const char* type=(diagnostic?"QUALIFICATION_MACOS_SOFTWARE":"QUALIFICATION_MACOS_SECURE_ENCLAVE");
#else
return jsNull(e);const char* type="UNAVAILABLE";
#endif
napi_value o;napi_create_object(e,&o);set(e,o,"publicKeySpki",str(e,b64(pub)));set(e,o,"publicKeyAlgorithm",str(e,"ECDSA_P256_SHA256"));set(e,o,"providerType",str(e,type));set(e,o,"providerKeyId",str(e,"VCPChat.Qualification.Q1."+qid));return o;}
static napi_value create(napi_env e,napi_callback_info i){
// No platform caller-isolation evidence is admitted in this source candidate.
if(qid.empty())return fail(e,"QUALIFICATION_NOT_INITIALIZED");
#ifdef _WIN32
Key k;if(k.open())return fail(e,"IDENTITY_EXISTS");if(!k.p)return fail(e,"PROVIDER_UNAVAILABLE");if(NCryptCreatePersistedKey(k.p,&k.k,NCRYPT_ECDSA_P256_ALGORITHM,keyName().c_str(),0,0))return fail(e,"KEY_CREATE_FAILED");DWORD exportPolicy=0,usage=NCRYPT_ALLOW_SIGNING_FLAG;if(NCryptSetProperty(k.k,NCRYPT_EXPORT_POLICY_PROPERTY,(PBYTE)&exportPolicy,sizeof(exportPolicy),NCRYPT_PERSIST_FLAG)||NCryptSetProperty(k.k,NCRYPT_KEY_USAGE_PROPERTY,(PBYTE)&usage,sizeof(usage),NCRYPT_PERSIST_FLAG)||NCryptFinalizeKey(k.k,0))return fail(e,"KEY_POLICY_FAILED");return identity(e,i);
#elif defined(__APPLE__)
SecKeyRef old=openKey();if(old){CFRelease(old);return fail(e,"IDENTITY_EXISTS");}CFDataRef t=tag();CFErrorRef error=nullptr;SecAccessControlRef ac=SecAccessControlCreateWithFlags(nullptr,kSecAttrAccessibleWhenUnlockedThisDeviceOnly,kSecAccessControlPrivateKeyUsage,&error);if(!ac){CFRelease(t);if(error)CFRelease(error);return fail(e,"KEY_POLICY_FAILED");}const void* pk[]={kSecAttrIsPermanent,kSecAttrApplicationTag,kSecAttrAccessControl};const void* pv[]={kCFBooleanTrue,t,ac};CFDictionaryRef priv=CFDictionaryCreate(nullptr,pk,pv,3,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);int bits=256;CFNumberRef size=CFNumberCreate(nullptr,kCFNumberIntType,&bits);const void* ks[]={kSecAttrKeyType,kSecAttrKeySizeInBits,kSecAttrTokenID,kSecPrivateKeyAttrs};const void* vs[]={kSecAttrKeyTypeECSECPrimeRandom,size,kSecAttrTokenIDSecureEnclave,priv};CFDictionaryRef original=CFDictionaryCreate(nullptr,ks,vs,4,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);CFMutableDictionaryRef attrs=CFDictionaryCreateMutableCopy(nullptr,0,original);CFRelease(original);if(diagnostic)CFDictionaryRemoveValue(attrs,kSecAttrTokenID);SecKeyRef key=SecKeyCreateRandomKey(attrs,&error);CFRelease(attrs);CFRelease(size);CFRelease(priv);CFRelease(ac);CFRelease(t);if(error)CFRelease(error);if(!key)return fail(e,"KEY_CREATE_FAILED");CFRelease(key);return identity(e,i);
#else
return fail(e,"PROVIDER_UNAVAILABLE");
#endif
}
static napi_value signProof(napi_env e,napi_callback_info info){size_t argc=1;napi_value arg;bool isBuffer=false;napi_get_cb_info(e,info,&argc,&arg,nullptr,nullptr);if(argc!=1)return fail(e,"PROOF_INVALID");napi_is_buffer(e,arg,&isBuffer);if(!isBuffer)return fail(e,"PROOF_INVALID");void* p;size_t n;napi_get_buffer_info(e,arg,&p,&n);if(!envelope((unsigned char*)p,n))return fail(e,"PROOF_INVALID");
// Direct addon invocation cannot bypass the Main production gate.
if(qid.empty())return fail(e,"QUALIFICATION_NOT_INITIALIZED");std::vector<unsigned char> signature;const char* format="P1363";
#ifdef _WIN32
Key k;if(!k.open())return fail(e,"KEY_LOST");BCRYPT_ALG_HANDLE alg;BCRYPT_HASH_HANDLE hash;DWORD objLen=0,got=0;unsigned char digest[32];if(BCryptOpenAlgorithmProvider(&alg,BCRYPT_SHA256_ALGORITHM,nullptr,0))return fail(e,"CRYPTO_ERROR");if(BCryptGetProperty(alg,BCRYPT_OBJECT_LENGTH,(PUCHAR)&objLen,sizeof(objLen),&got,0)){BCryptCloseAlgorithmProvider(alg,0);return fail(e,"CRYPTO_ERROR");}std::vector<unsigned char> obj(objLen);if(BCryptCreateHash(alg,&hash,obj.data(),objLen,nullptr,0,0)){BCryptCloseAlgorithmProvider(alg,0);return fail(e,"CRYPTO_ERROR");}auto status=BCryptHashData(hash,(PUCHAR)p,(ULONG)n,0);if(!status)status=BCryptFinishHash(hash,digest,32,0);BCryptDestroyHash(hash);BCryptCloseAlgorithmProvider(alg,0);if(status)return fail(e,"CRYPTO_ERROR");DWORD count=0;if(NCryptSignHash(k.k,nullptr,digest,32,nullptr,0,&count,0)||count!=64)return fail(e,"SIGN_FAILED");signature.resize(count);if(NCryptSignHash(k.k,nullptr,digest,32,signature.data(),count,&count,0))return fail(e,"SIGN_FAILED");
#elif defined(__APPLE__)
SecKeyRef key=openKey();if(!key)return fail(e,"KEY_LOST");CFDataRef message=CFDataCreate(nullptr,(UInt8*)p,n);CFErrorRef err=nullptr;CFDataRef s=SecKeyCreateSignature(key,kSecKeyAlgorithmECDSASignatureMessageX962SHA256,message,&err);CFRelease(message);CFRelease(key);if(err)CFRelease(err);if(!s)return fail(e,"SIGN_FAILED");signature.assign(CFDataGetBytePtr(s),CFDataGetBytePtr(s)+CFDataGetLength(s));CFRelease(s);format="DER";
#else
return fail(e,"PROVIDER_UNAVAILABLE");
#endif
napi_value out,bytes;napi_create_object(e,&out);napi_create_buffer_copy(e,signature.size(),signature.data(),nullptr,&bytes);set(e,out,"bytes",bytes);set(e,out,"format",str(e,format));return out;}
static napi_value properties(napi_env e,napi_callback_info){napi_value o;napi_create_object(e,&o);set(e,o,"KeyExtractionProtection",str(e,"UNKNOWN"));set(e,o,"KeyInvocationIsolation",str(e,"UNKNOWN"));set(e,o,"productionEligible",jsBoolean(e,false));set(e,o,"reason",str(e,"QUALIFICATION_ONLY: same-principal invocation may be possible; no Human or production admission"));return o;}
// Provider-adjacent non-secret locator. This is not admission authority or key material.
static napi_value readDescriptor(napi_env e,napi_callback_info){if(qid.empty())return jsNull(e);
#ifdef _WIN32
Key k;if(!k.open())return jsNull(e);DWORD n=0;auto status=NCryptGetProperty(k.k,L"VCPChat.Qualification.Descriptor",nullptr,0,&n,NCRYPT_PERSIST_ONLY_FLAG);if(status==NTE_NOT_FOUND)return jsNull(e);if(status||n>8192)return fail(e,"DESCRIPTOR_UNAVAILABLE");std::vector<unsigned char>b(n);if(NCryptGetProperty(k.k,L"VCPChat.Qualification.Descriptor",b.data(),n,&n,NCRYPT_PERSIST_ONLY_FLAG))return fail(e,"DESCRIPTOR_UNAVAILABLE");return str(e,std::string((char*)b.data(),n));
#elif defined(__APPLE__)
const void* ks[]={kSecClass,kSecAttrService,kSecAttrAccount,kSecReturnData};const void* vs[]={kSecClassGenericPassword,serviceName(),CFSTR("descriptor"),kCFBooleanTrue};CFDictionaryRef q=CFDictionaryCreate(nullptr,ks,vs,4,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);CFTypeRef data=nullptr;OSStatus status=SecItemCopyMatching(q,&data);CFRelease(q);if(status==errSecItemNotFound)return jsNull(e);if(status!=errSecSuccess)return fail(e,"DESCRIPTOR_UNAVAILABLE");CFDataRef d=(CFDataRef)data;std::string json((char*)CFDataGetBytePtr(d),CFDataGetLength(d));CFRelease(d);if(json.size()>8192)return fail(e,"DESCRIPTOR_UNAVAILABLE");return str(e,json);
#else
return jsNull(e);
#endif
}
static napi_value writeDescriptor(napi_env e,napi_callback_info info){if(qid.empty())return fail(e,"QUALIFICATION_NOT_INITIALIZED");size_t count=1;napi_value arg;size_t n=0;napi_get_cb_info(e,info,&count,&arg,nullptr,nullptr);if(count!=1||napi_get_value_string_utf8(e,arg,nullptr,0,&n)!=napi_ok||n>8192)return fail(e,"DESCRIPTOR_INVALID");std::vector<char>b(n+1);napi_get_value_string_utf8(e,arg,b.data(),b.size(),&n);
#ifdef _WIN32
Key k;if(!k.open())return fail(e,"KEY_LOST");if(NCryptSetProperty(k.k,L"VCPChat.Qualification.Descriptor",(PBYTE)b.data(),(DWORD)n,NCRYPT_PERSIST_FLAG))return fail(e,"DESCRIPTOR_WRITE_FAILED");return jsBoolean(e,true);
#elif defined(__APPLE__)
SecKeyRef k=openKey();if(!k)return fail(e,"KEY_LOST");CFRelease(k);CFDataRef d=CFDataCreate(nullptr,(UInt8*)b.data(),n);const void* ks[]={kSecClass,kSecAttrService,kSecAttrAccount,kSecAttrAccessible,kSecValueData};const void* vs[]={kSecClassGenericPassword,serviceName(),CFSTR("descriptor"),kSecAttrAccessibleWhenUnlockedThisDeviceOnly,d};CFDictionaryRef q=CFDictionaryCreate(nullptr,ks,vs,5,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);OSStatus status=SecItemAdd(q,nullptr);CFRelease(q);if(status==errSecDuplicateItem){const void* qk[]={kSecClass,kSecAttrService,kSecAttrAccount};const void* qv[]={kSecClassGenericPassword,serviceName(),CFSTR("descriptor")};q=CFDictionaryCreate(nullptr,qk,qv,3,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);const void* uk[]={kSecValueData};const void* uv[]={d};CFDictionaryRef u=CFDictionaryCreate(nullptr,uk,uv,1,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);status=SecItemUpdate(q,u);CFRelease(u);CFRelease(q);}CFRelease(d);if(status!=errSecSuccess)return fail(e,"DESCRIPTOR_WRITE_FAILED");return jsBoolean(e,true);
#else
return fail(e,"PROVIDER_UNAVAILABLE");
#endif
}
// Boolean-only negative extraction probe; raw private material never leaves native code.
static napi_value probeExport(napi_env e,napi_callback_info){if(qid.empty())return fail(e,"QUALIFICATION_NOT_INITIALIZED");
#ifdef _WIN32
 Key k;if(!k.open())return fail(e,"KEY_LOST");DWORD n=0;SECURITY_STATUS st=NCryptExportKey(k.k,0,BCRYPT_ECCPRIVATE_BLOB,nullptr,nullptr,0,&n,0);if(st||!n)return jsBoolean(e,false);std::vector<unsigned char> secret(n);st=NCryptExportKey(k.k,0,BCRYPT_ECCPRIVATE_BLOB,nullptr,secret.data(),n,&n,0);SecureZeroMemory(secret.data(),secret.size());return jsBoolean(e,st==0);
#elif defined(__APPLE__)
 SecKeyRef k=openKey();if(!k)return fail(e,"KEY_LOST");CFErrorRef err=nullptr;CFDataRef d=SecKeyCopyExternalRepresentation(k,&err);CFRelease(k);if(err)CFRelease(err);bool available=d!=nullptr;if(d)CFRelease(d);return jsBoolean(e,available);
#else
 return fail(e,"PROVIDER_UNAVAILABLE");
#endif
}
static napi_value destroy(napi_env e,napi_callback_info){if(qid.empty())return fail(e,"QUALIFICATION_NOT_INITIALIZED");
#ifdef _WIN32
 Key k;if(!k.open())return jsBoolean(e,true);auto status=NCryptDeleteKey(k.k,0);if(status)return fail(e,"QUALIFICATION_CLEANUP_FAILED");k.k=0;return jsBoolean(e,true);
#elif defined(__APPLE__)
 CFDataRef t=tag();const void* ks[]={kSecClass,kSecAttrApplicationTag,kSecAttrKeyType};const void* vs[]={kSecClassKey,t,kSecAttrKeyTypeECSECPrimeRandom};CFDictionaryRef q=CFDictionaryCreate(nullptr,ks,vs,3,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);auto status=SecItemDelete(q);CFRelease(q);CFRelease(t);if(status!=errSecSuccess&&status!=errSecItemNotFound)return fail(e,"QUALIFICATION_CLEANUP_FAILED");
 const void* dk[]={kSecClass,kSecAttrService,kSecAttrAccount};const void* dv[]={kSecClassGenericPassword,serviceName(),CFSTR("descriptor")};q=CFDictionaryCreate(nullptr,dk,dv,3,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);status=SecItemDelete(q);CFRelease(q);if(status!=errSecSuccess&&status!=errSecItemNotFound)return fail(e,"QUALIFICATION_CLEANUP_FAILED");return jsBoolean(e,true);
#else
 return jsBoolean(e,true);
#endif
}
static napi_value init(napi_env e,napi_value exports){napi_property_descriptor p[]={{"qualificationInit",0,qualificationInit,0,0,0,napi_default,0},{"probePrivateExport",0,probeExport,0,0,0,napi_default,0},{"destroyIdentity",0,destroy,0,0,0,napi_default,0},{"getIdentity",0,identity,0,0,0,napi_default,0},{"createIdentity",0,create,0,0,0,napi_default,0},{"signHumanClientProtocolProof",0,signProof,0,0,0,napi_default,0},{"getSecurityProperties",0,properties,0,0,0,napi_default,0},{"readDescriptor",0,readDescriptor,0,0,0,napi_default,0},{"writeDescriptor",0,writeDescriptor,0,0,0,napi_default,0}};napi_define_properties(e,exports,sizeof(p)/sizeof(p[0]),p);return exports;}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
