import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'DomainRadar — Expiring & dropping domains',description:'Browse expiring and dropping domains, filter by extension and see their estimated availability.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
