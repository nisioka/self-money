import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: '/', label: 'ダッシュボード' },
  { path: '/transactions', label: '取引' },
  { path: '/reports', label: 'レポート' },
  { path: '/accounts', label: '口座' },
  { path: '/categories', label: '費目' },
];

export function Layout({ children }: LayoutProps) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="text-2xl font-bold">
              家計簿
            </Link>
            {/* Desktop Navigation */}
            <nav className="hidden md:flex space-x-6">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`hover:text-blue-200 transition-colors ${
                    location.pathname === item.path
                      ? 'text-white font-semibold border-b-2 border-white'
                      : 'text-blue-100'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <nav className="md:hidden bg-blue-500 text-white">
        <div className="container mx-auto px-4 py-2 flex justify-around">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`text-xs text-center py-1 px-2 rounded ${
                location.pathname === item.path
                  ? 'bg-blue-700 font-semibold'
                  : 'text-blue-100'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 flex-grow">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-300 py-4">
        <div className="container mx-auto px-4 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} 家計簿アプリ</p>
        </div>
      </footer>
    </div>
  );
}
