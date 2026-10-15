export const STATUS_INFO = [
 {label:'Source-reported deletion',description:'The public source reported a historical deletion. The domain may already have been registered again. Open its details for a fresh check; this report does not confirm availability today.'},
 {label:'Release estimate passed',description:'The source-listed release date has passed. This archived observation does not prove the domain expired, was deleted or is currently available. Open its details to check its current registration status.'},
 {label:'Expected release',description:'An expiring-domain source lists this domain with a projected release date. It is an estimate, not a promise of availability. The holder may restore it, and other buyers may register it immediately when it drops.'},
 {label:'Listed candidate',description:'A third-party list reports this domain for an upcoming date. The date may refer to expiration or release; its current registry status has not been confirmed.'},
 {label:'Registered',description:'The domain is registered to a holder. An expiration date is not a promise that it will become available; the holder may renew it.'},
 {label:'Expired',description:'The reported expiration date has passed. The domain may still be held, renewed, restored or auctioned. This does not mean it is available to register.'},
 {label:'Recovery period',description:'The domain is in a registry-specific recovery period. Its holder may still be able to renew or restore it. It is not available for a new registration during this period.'},
 {label:'Pending deletion',description:'The registry reports that deletion is pending. This status alone does not confirm the exact release time. Check the source and confirm availability with a registrar.'},
 {label:'Unverified',description:'We could not confirm the current registration status from the available source. This can happen when a source is unavailable. It does not mean the domain is free.'},
] as const;
export function statusInfo(status:string){return STATUS_INFO.find(s=>s.label===status)??STATUS_INFO.find(s=>s.label==='Unverified')!;}
