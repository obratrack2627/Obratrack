'use client';
import { formatCLP } from '@/lib/utils';

/** Container-relative sizing stays in sync with layout and font loading without JS measurements. */
export default function MoneyAmount({value,className=''}:{value:number;className?:string}){
 const amount=formatCLP(value);
 return <span className={`money-amount overflow-hidden inline-block w-full min-w-0 max-w-full align-bottom ${className}`} style={{containerType:'inline-size'}}><span className="block whitespace-nowrap tabular-nums" style={{fontSize:`min(1em, calc((100cqw - 2px) * 1.55 / ${Math.max(1,amount.length)}))`}}>{amount}</span></span>;
}
