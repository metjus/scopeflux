import {Info} from 'lucide-react';
import {STATUS_INFO} from '../lib/status';
export default function StatusGuide(){return <details className="status-guide"><summary><Info size={14}/> What do these statuses mean?</summary><dl>{STATUS_INFO.map(s=><div key={s.label}><dt>{s.label}</dt><dd>{s.description}</dd></div>)}</dl><p>None of these statuses confirms that a domain is available. Verify it with a registrar before registering.</p></details>}
