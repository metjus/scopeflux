'use client';

import {ChevronLeft, ChevronRight} from 'lucide-react';

type PaginationProps = {
  page: number; totalPages: number; start: number; end: number; total: number;
  onPage: (page: number) => void;
};

export default function ResultPagination({page, totalPages, start, end, total, onPage}: PaginationProps) {
  if (!total) return null;
  return (
    <nav className="result-pagination" aria-label="Domain result pages">
      <span role="status">Showing {start.toLocaleString('en-GB')}–{end.toLocaleString('en-GB')} of {total.toLocaleString('en-GB')}</span>
      <div>
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={16}/> Previous</button>
        <label>Page <select aria-label="Result page" value={page} onChange={event => onPage(Number(event.target.value))}>
          {Array.from({length: totalPages}, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
        </select> of {totalPages}</label>
        <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next <ChevronRight size={16}/></button>
      </div>
    </nav>
  );
}
