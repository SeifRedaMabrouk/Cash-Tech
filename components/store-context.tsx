'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { defaults, type Settings, type Product } from '../lib/domain';
type CartItem = { id: string; quantity: number };
type Context = {
  products: Product[];
  settings: Settings;
  serverNow: number;
  loading: boolean;
  error: string;
  cart: CartItem[];
  setQuantity: (id: string, n: number) => void;
  reload: () => Promise<void>;
};
const Store = createContext<Context | null>(null);
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]),
    [settings, setSettings] = useState(defaults),
    [serverNow, setNow] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [cart, setCart] = useState<CartItem[]>([]),
    [ready, setReady] = useState(false);
  const reload = useCallback(async () => {
    try {
      const r = await fetch('/api/catalog', { cache: 'no-store' });
      const d = (await r.json()) as {
        error?: string;
        products: Product[];
        settings: Settings;
        serverNow: number;
      };
      if (!r.ok) throw new Error(d.error);
      setProducts(d.products);
      setSettings(d.settings);
      setNow(d.serverNow);
      setError('');
    } catch {
      setError('تعذر تحميل بيانات المتجر. حاول تحديث الصفحة.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), 60000);
    try {
      const saved = JSON.parse(localStorage.getItem('cashtech-cart-v1') ?? '[]');
      if (Array.isArray(saved))
        setCart(
          saved
            .filter(
              (x) =>
                typeof x.id === 'string' &&
                Number.isInteger(x.quantity) &&
                x.quantity > 0 &&
                x.quantity <= 20,
            )
            .slice(0, 40),
        );
    } catch {}
    setReady(true);
    return () => clearInterval(timer);
  }, [reload]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem('cashtech-cart-v1', JSON.stringify(cart));
      } catch {}
  }, [cart, ready]);
  function setQuantity(id: string, n: number) {
    setCart((c) =>
      n <= 0
        ? c.filter((x) => x.id !== id)
        : c.some((x) => x.id === id)
          ? c.map((x) => (x.id === id ? { id, quantity: Math.min(20, n) } : x))
          : c.length < 40
            ? [...c, { id, quantity: Math.min(20, n) }]
            : c,
    );
  }
  return (
    <Store.Provider value={{ products, settings, serverNow, loading, error, cart, setQuantity, reload }}>
      {children}
    </Store.Provider>
  );
}
export function useStore() {
  const x = useContext(Store);
  if (!x) throw new Error('Store provider required');
  return x;
}
