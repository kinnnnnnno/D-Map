import { useEffect, useRef, type ReactNode } from "react";
import { lockBodyOverflow } from "../lib/scrollLock";
export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const dialog=ref.current!;
    const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const release=lockBodyOverflow();
    dialog.showModal();
    return()=>{dialog.close();release();if(opener?.isConnected) opener.focus({preventScroll:true});};
  },[]);
  return <dialog ref={ref} className="account-dialog" aria-label={title} aria-modal="true"
    onCancel={event=>{event.preventDefault();event.stopPropagation();onClose();}}
    onKeyDown={event=>{
      event.stopPropagation();
      if(event.key!=="Tab") return;
      const nodes=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select,textarea,a[href]')).filter(node=>node.getClientRects().length);
      if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1)?.focus();}
      else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0]?.focus();}
    }}>
    <div className="account-heading"><h2>{title}</h2><button type="button" className="close-button" aria-label={`${title}を閉じる`} onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}
