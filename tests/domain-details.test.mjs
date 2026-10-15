import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeDomainDetails, withReleaseEstimate} from '../lib/domain-details.ts';
const current = {domain:'example.com',tld:'com',status:'Registered',drop:null,expiration:'2034-10-15',source:'Registry',sourceUrl:'https://registry.test/',checkedAt:'2026-10-15T15:00:00Z'};
const listed = {...current,status:'Expected release',expiration:null,drop:'2026-10-20',source:'Provider',sourceUrl:'https://provider.test/',checkedAt:'2026-10-15T14:00:00Z'};

test('live registration and source release retain separate timestamps and source URLs', () => {
 const result=withReleaseEstimate(current,listed);
 assert.equal(result.expiration,current.expiration);
 assert.equal(result.checkedAt,current.checkedAt);
 assert.equal(result.drop,listed.drop);
 assert.equal(result.availabilityCheckedAt,listed.checkedAt);
 assert.equal(result.availabilityUrl,listed.sourceUrl);
 const stronger={...current,drop:'2026-10-21',availabilitySource:'Current provider'};
 assert.deepEqual(withReleaseEstimate(stronger,listed),stronger);
});

test('opening a historical deletion does not turn it into expected availability', () => {
 const report={...listed,drop:null,reportedDrop:{at:'2026-10-14T14:00:00Z',source:'Public history',url:'https://history.test/',checkedAt:listed.checkedAt,label:'Yesterday 14:00',sourceDate:'Thu, 15 Oct 2026 14:30:00 GMT'}};
 const result=mergeDomainDetails(current,report);
 assert.equal(result.drop,null);
 assert.equal(result.reportedDrop.at,report.reportedDrop.at);
 assert.equal(result.status,'Registered');
});

test('an archived past estimate stays historical when the current registry has no release date', () => {
 const result=mergeDomainDetails(current,{...listed,status:'Release estimate passed',drop:'2026-10-01'});
 assert.equal(result.drop,null);
 assert.equal(result.listedDate,'2026-10-01');
 assert.equal(result.expiration,current.expiration);
});
