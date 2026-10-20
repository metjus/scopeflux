import assert from 'node:assert/strict';
import test from 'node:test';
import {parseUnstoppableListings} from '../lib/unstoppable-feed.ts';

test('only the matching TLD and upcoming dates appear', () => {
 const later = new Date(Date.now()+86400000).toISOString();
 const earlier = new Date(Date.now()-86400000).toISOString();
 const result = parseUnstoppableListings({domains:[
  {name:'alpha.com',deletionAt:later},
  {name:'beta.net',deletionAt:later},
  {name:'old.com',deletionAt:earlier}
 ]},'com',new Date().toISOString());
 assert.deepEqual(result.map(row=>row.domain),['alpha.com']);
});
test('unexpected responses raise an error',()=>{
 assert.throws(()=>parseUnstoppableListings({},'com',new Date().toISOString()));
});
