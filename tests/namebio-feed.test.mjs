import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNameBio} from '../lib/namebio-feed.ts';
test('NameBio sample recognizes both Verisign endings and date-only records',()=>{
 const next=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 const rows=parseNameBio('first.com:'+next+'\nsecond.net:'+next+'\nwrong.org:'+next+'\n');
 assert.deepEqual(rows.map(item=>item.domain),['first.com','second.net']);
});
test('NameBio rejects malformed names',()=>{
 const next=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 assert.deepEqual(parseNameBio('bad/name.com:'+next+'\n').length,0);
});
