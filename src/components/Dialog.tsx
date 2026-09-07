import type { ReactNode } from 'react';
import { useUiStore } from '../store/uiStore';

interface Props {
  title: string;
  children: ReactNode;
  width?: string;
  onClose?: () => void;
}

export function Dialog({ title, children, width = 'max-w-xl', onClose }: Props) {
  const closeDialog = useUiStore((s) => s.closeDialog);
  const close = onClose ?? closeDialog;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={close} role="dialog">
      <div
        className={`panel flex max-h-[90vh] w-full ${width} flex-col overflow-hidden shadow-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn btn-icon h-7 w-7 text-sm" onClick={close} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
