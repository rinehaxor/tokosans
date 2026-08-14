import { useEffect } from 'react';
import { Toaster, toast } from 'react-hot-toast';

export default function ToastProvider() {
  useEffect(() => {
    const showToast = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: 'success' | 'error' | 'loading'; message?: string }>).detail;
      if (!detail?.message) return;
      toast[detail.type ?? 'success'](detail.message);
    };

    window.addEventListener('app:toast', showToast);
    return () => window.removeEventListener('app:toast', showToast);
  }, []);

  return <Toaster position="top-right" toastOptions={{ duration: 3500 }} />;
}