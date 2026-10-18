'use client';

import Link from 'next/link';

// Next conserva historial, scroll, prefetch y abrir en otra pestaña. La modalidad se conoce antes de capturar la vista.
export default function EnlacePublico({ onClick, transitionTypes = ['publico'], ...props }) {
  return <Link {...props} transitionTypes={transitionTypes} onClick={(e) => {
    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
      document.documentElement.dataset.publicoTeclado = e.detail === 0 ? '1' : '0';
    }
    onClick?.(e);
  }} />;
}
