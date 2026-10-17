'use client';
import {useState} from 'react';
import {ArrowRight,ArrowUpRight} from 'lucide-react';
import type {PageId} from '../lib/navigation';

// How a domain gets from "registered" to "free again", per extension family.
// Durations and prices are typical values, not registry guarantees: keep the
// wording hedged and the fee table pointing at the registrar's price list.
type Stage={name:string;when:string;caption:string;owner:string;cost:string;tone:'safe'|'warn'|'risk'|'lock'|'free'};
type Track={id:string;label:string;tlds:string;intro:string;stages:Stage[];notes:{title:string;text:string}[]};

export const TRACKS:Track[]=[
 {id:'global',label:'Global',tlds:'.com .net .org .io .app',intro:'Most global extensions follow the same ICANN-style path. The exact number of days depends on the registrar and the registry, so treat the lengths below as typical, not fixed.',stages:[
  {name:'Active',when:'Until the expiration date',caption:'The domain is registered and paid.',owner:'Renews at the normal price.',cost:'Normal renewal',tone:'safe'},
  {name:'Grace period',when:'About 0–45 days',caption:'Expired, but the owner can still renew it. The website and email often stop working.',owner:'Can renew, usually at the normal price.',cost:'Normal renewal, sometimes a late fee',tone:'warn'},
  {name:'Redemption',when:'About 30 days',caption:'Removed from the owner’s account. Only the old owner can win it back.',owner:'Can restore it, but pays an extra restore fee.',cost:'Restore fee + renewal',tone:'risk'},
  {name:'Pending delete',when:'5 days',caption:'Locked. Nobody can renew, restore or register it.',owner:'Nothing can be done any more.',cost:'Not possible',tone:'lock'},
  {name:'Released',when:'Drop day',caption:'Deleted by the registry. The first registration wins.',owner:'Anyone can register it.',cost:'Normal registration or a backorder',tone:'free'},
 ],notes:[
  {title:'The registrar may sell it first',text:'During the grace period many registrars put expired names into their own auction. If someone buys it there, the name never reaches the drop.'},
  {title:'The drop is a race',text:'Released names are often caught within seconds by backorder services. If you want a valuable name, a backorder usually beats typing it in by hand.'},
 ]},
 {id:'sk',label:'.sk',tlds:'.sk',intro:'Slovak domains are run by SK-NIC. There is no expensive redemption stage: an unpaid domain is held for a while and then deleted on a set day.',stages:[
  {name:'Active',when:'Until the expiration date',caption:'The domain is registered and paid.',owner:'Renews at the normal price.',cost:'Normal renewal',tone:'safe'},
  {name:'Expired, unpaid',when:'Right after expiry',caption:'The renewal was not paid in time. The registrar still holds the name for the owner.',owner:'Can still pay and keep it.',cost:'Usually the normal renewal',tone:'warn'},
  {name:'Held',when:'Until the deletion day',caption:'The name is listed as held, with its deletion day. This is the list ScopeFlux shows.',owner:'Can usually still save it by paying.',cost:'Usually the normal renewal',tone:'risk'},
  {name:'Deletion day',when:'Date on the list',caption:'The registry deletes the domain. The source gives only the date, not the hour.',owner:'Too late to save it.',cost:'Not possible',tone:'lock'},
  {name:'Free',when:'Usually the next day',caption:'The name can be registered again, first come, first served.',owner:'Anyone can register it.',cost:'Normal registration',tone:'free'},
 ],notes:[
  {title:'Be ready early',text:'For a name you really want, have a registrar account ready and paid credit before the release. Backorder services for .sk also exist.'},
  {title:'The date can still change',text:'If the owner pays while the name is held, it disappears from the list and is never deleted.'},
 ]},
 {id:'cz',label:'.cz',tlds:'.cz',intro:'Czech domains are run by CZ.NIC. Instead of simply dropping, an expired .cz name goes to a public auction run by the registry itself.',stages:[
  {name:'Active',when:'Until the expiration date',caption:'The domain is registered and paid.',owner:'Renews at the normal price.',cost:'Normal renewal',tone:'safe'},
  {name:'Protection period',when:'About the first 30 days',caption:'Expired, but the website and email usually keep working for now.',owner:'Can renew at the normal price.',cost:'Normal renewal',tone:'warn'},
  {name:'Switched off',when:'About days 30–60',caption:'The domain stops working on the internet, but it still belongs to the owner.',owner:'Can still renew it.',cost:'Normal renewal',tone:'risk'},
  {name:'Registry auction',when:'Announced about 15 days ahead',caption:'CZ.NIC auctions the name. ScopeFlux shows when bidding opens.',owner:'Has lost it. Anyone can bid through a registrar.',cost:'Your winning bid',tone:'lock'},
  {name:'Released',when:'Day after the auction',caption:'If nobody bought it, the name becomes free for normal registration.',owner:'Anyone can register it.',cost:'Normal registration',tone:'free'},
 ],notes:[
  {title:'Auction first, drop second',text:'A good .cz name is usually sold in the auction. Only names nobody bid on are released the day after.'},
  {title:'Bidding goes through a registrar',text:'You join a CZ.NIC auction through a registrar that supports it. Check the auction rules before you bid.'},
 ]},
];

// Read top to bottom: each step is later than the one before. One general
// line per step for every extension; the timeline above has the specifics.
export const FEES=[
 {step:'Pays on time',when:'Before the expiration date',price:'Normal yearly price',note:'The usual renewal at the registrar.'},
 {step:'Pays a little late',when:'First days or weeks after expiry',price:'Usually still the normal price',note:'Some registrars add a small late fee.'},
 {step:'Pays very late',when:'Last stage before deletion',price:'Can cost a lot more',note:'Some extensions charge a restore fee, often about 50–200 EUR, on top of the renewal.'},
 {step:'Too late for the owner',when:'Deletion or auction',price:'Cannot be saved any more',note:'The domain is deleted, or sold in an auction.'},
 {step:'Someone else gets it',when:'After release',price:'Normal price, a backorder fee or an auction bid',note:'Whoever is first registers it at the normal price. A backorder service or an auction can cost more.'},
];

const QUESTIONS=[
 {q:'If a domain is on the list, will it definitely become free?',a:'No. The owner can renew it until the last stage, and a registrar may sell it at auction first. A release date is an estimate from the source, not a promise.'},
 {q:'Can I buy a domain while it is in the grace period or redemption?',a:'Not from the registry. Only the current owner can renew or restore it. Some registrars sell their own expired names at auction during the grace period.'},
 {q:'Why does the website still work after the expiration date?',a:'Many registrars and registries keep the name running for a few days or weeks after expiry, to give the owner a chance to notice and pay.'},
 {q:'Does ScopeFlux register domains?',a:'No. ScopeFlux only shows what public sources publish. To register, backorder or bid, use a registrar.'},
];

export function HowItWorksPage({navigate}:{navigate:(tab:PageId)=>void}){
 const [trackId,setTrackId]=useState('global');
 const track=TRACKS.find(t=>t.id===trackId)!;
 return <section className="information-page how-page" aria-label="How domain expiry works">
  <div className="how-summary">
   <span className="eyebrow">THE SHORT VERSION</span>
   <ol>
    <li><strong>Expired does not mean free.</strong> The owner gets extra time to pay, often weeks.</li>
    <li><strong>Waiting longer costs the owner more.</strong> Late renewal is cheap, restoring from redemption is not.</li>
    <li><strong>Only at the end can anyone else get it.</strong> Then it is first come, first served, or an auction.</li>
   </ol>
  </div>

  <div className="section-intro">
   <span className="eyebrow">THE TIMELINE</span>
   <h2>From expired to available, step by step.</h2>
   <p>Pick an extension. Each column is one stage, from left to right.</p>
  </div>

  <div className="how-tabs" role="tablist" aria-label="Extension">
   {TRACKS.map(t=><button key={t.id} type="button" role="tab" id={'how-tab-'+t.id} aria-controls="how-panel" aria-selected={t.id===trackId} className={t.id===trackId?'active':''} onClick={()=>setTrackId(t.id)}>{t.label}{t.tlds!==t.label&&<small>{t.tlds}</small>}</button>)}
  </div>

  <div className="how-panel" id="how-panel" role="tabpanel" aria-labelledby={'how-tab-'+track.id}>
   <p className="how-intro">{track.intro}</p>
   <ol className="how-timeline">
    {track.stages.map((stage,i)=><li key={stage.name} className={'tone-'+stage.tone}>
     <div className="how-bar"><span>{String(i+1).padStart(2,'0')}</span></div>
     <div className="how-stage">
      <strong>{stage.name}</strong>
      <span className="how-when">{stage.when}</span>
      <p>{stage.caption}</p>
      <dl>
       <div><dt>Owner</dt><dd>{stage.owner}</dd></div>
       <div><dt>Cost</dt><dd>{stage.cost}</dd></div>
      </dl>
     </div>
    </li>)}
   </ol>
   <div className="how-legend" aria-hidden="true"><span className="tone-safe">Owner is safe</span><span className="tone-warn">Owner should pay now</span><span className="tone-risk">Last chance for the owner</span><span className="tone-lock">Locked or auction</span><span className="tone-free">Free to register</span></div>
   <div className="how-notes">{track.notes.map(note=><article key={note.title}><h3>{note.title}</h3><p>{note.text}</p></article>)}</div>
  </div>

  <div className="section-intro how-section">
   <span className="eyebrow">WHAT IT COSTS</span>
   <h2>Fees when an owner forgets to pay.</h2>
   <p>Read from top to bottom: each step comes later than the one before. This applies to every extension; prices are typical, and the registrar’s own price list is what counts.</p>
  </div>
  <ol className="how-fees">
   {FEES.map((fee,i)=><li key={fee.step}>
    <span className="how-fee-n">{i+1}</span>
    <div>
     <strong>{fee.step}</strong><span className="how-when">{fee.when}</span>
     <b>{fee.price}</b>
     <p>{fee.note}</p>
    </div>
   </li>)}
  </ol>

  <div className="section-intro how-section">
   <span className="eyebrow">WHAT THIS MEANS FOR YOU</span>
   <h2>Three things to remember.</h2>
  </div>
  <div className="feature-grid">
   {[{n:'01',title:'A date is a forecast',text:'Release dates come from public sources. The owner can still renew, so a name can vanish from the list at any time.'},{n:'02',title:'Timing matters',text:'Most good names are taken in the first minutes after release. Know the exact day and be ready, or use a backorder.'},{n:'03',title:'Check before you plan',text:'Open a domain in ScopeFlux to see its current registration status, then confirm with a registrar before you count on it.'}].map(item=><article className="feature-card" key={item.n}><div><span className="step-number">{item.n}</span></div><h3>{item.title}</h3><p>{item.text}</p></article>)}
  </div>

  <div className="section-intro how-section">
   <span className="eyebrow">QUICK ANSWERS</span>
   <h2>Common questions.</h2>
  </div>
  <div className="how-faq">
   {QUESTIONS.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
  </div>

  <div className="info-callout how-cta">
   <div><strong>Ready to look for a name?</strong><p>Browse the domains that are getting close to release, filtered by your favourite extensions.</p></div>
   <button className="primary" type="button" onClick={()=>navigate('discover')}>Browse expiring domains <ArrowRight size={17}/></button>
  </div>
  <p className="how-source">General rules: <a href="https://www.icann.org/resources/pages/domain-name-renewal-expiration-faqs-2018-12-07-en" target="_blank" rel="noreferrer">ICANN renewal and expiration FAQ <ArrowUpRight size={13}/></a> <a href="https://www.nic.cz/files/documents/Pravidla_aukci.pdf" target="_blank" rel="noreferrer">CZ.NIC auction rules <ArrowUpRight size={13}/></a> <a href="https://sk-nic.sk/" target="_blank" rel="noreferrer">SK-NIC <ArrowUpRight size={13}/></a></p>
 </section>;
}
