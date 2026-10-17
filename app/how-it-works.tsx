'use client';
import {ArrowRight,ArrowUpRight} from 'lucide-react';
import type {PageId} from '../lib/navigation';

// How a domain gets from "registered" to "free again". One general path for
// every extension: the names of the stages differ per registry, the order does
// not. Durations and prices are typical values, not registry guarantees.
type Stage={name:string;when:string;caption:string;owner:string;cost:string;tone:'safe'|'warn'|'risk'|'lock'|'free'};

export const STAGES:Stage[]=[
 {name:'Active',when:'Until the expiration date',caption:'The domain is registered and paid.',owner:'Renews at the normal price.',cost:'Normal renewal',tone:'safe'},
 {name:'Grace period',when:'First days or weeks',caption:'Expired, but the owner can still renew it. The website and email may stop working.',owner:'Can renew, usually at the normal price.',cost:'Normal renewal, sometimes a late fee',tone:'warn'},
 {name:'Last chance',when:'Before deletion',caption:'The final stage before the domain is deleted. Only the old owner can still save it.',owner:'Can still save it, sometimes with an extra restore fee.',cost:'Renewal or a restore fee',tone:'risk'},
 {name:'Deletion or auction',when:'A set day',caption:'Locked: nobody can renew or register it. Then the registry deletes it, or sells it in a public auction.',owner:'Too late to save it.',cost:'Not possible',tone:'lock'},
 {name:'Released',when:'After deletion or auction',caption:'The domain is free again. The first registration wins.',owner:'Anyone can register it.',cost:'Normal registration or a backorder',tone:'free'},
];

const NOTES=[
 {title:'It can be sold before it drops',text:'Some registrars auction expired names during the grace period, and some registries auction them instead of deleting them. If someone buys it there, the name never becomes free.'},
 {title:'The release is a race',text:'Released names are often caught within seconds by backorder services. If you want a valuable name, be ready on the day or use a backorder.'},
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
 {q:'Can I buy a domain before it is released?',a:'Not from the registry. Only the current owner can renew or restore it. Some registrars sell their own expired names at auction during the grace period.'},
 {q:'Why does the website still work after the expiration date?',a:'Many registrars and registries keep the name running for a few days or weeks after expiry, to give the owner a chance to notice and pay.'},
 {q:'Does ScopeFlux register domains?',a:'No. ScopeFlux only shows what public sources publish. To register, backorder or bid, use a registrar.'},
];

export function HowItWorksPage({navigate}:{navigate:(tab:PageId)=>void}){
 return <section className="information-page how-page" aria-label="How domain expiry works">
  <div className="how-summary">
   <span className="eyebrow">THE SHORT VERSION</span>
   <ol>
    <li><strong>Expired does not mean free.</strong> The owner gets extra time to pay, often weeks.</li>
    <li><strong>Waiting longer costs the owner more.</strong> Paying a little late is cheap, paying at the last moment can cost a lot more.</li>
    <li><strong>Only at the end can anyone else get it.</strong> Then it is first come, first served, or an auction.</li>
   </ol>
  </div>

  <div className="section-intro">
   <span className="eyebrow">THE TIMELINE</span>
   <h2>From expired to available, step by step.</h2>
   <p>The same path applies to every extension. Read it from left to right; the exact number of days depends on the registry and the registrar.</p>
  </div>

  <div className="how-panel">
   <ol className="how-timeline">
    {STAGES.map((stage,i)=><li key={stage.name} className={'tone-'+stage.tone}>
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
   <div className="how-notes">{NOTES.map(note=><article key={note.title}><h3>{note.title}</h3><p>{note.text}</p></article>)}</div>
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
