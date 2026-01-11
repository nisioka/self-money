import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Layout } from './Layout';

const renderWithRouter = (component: React.ReactNode) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('Layout', () => {
  it('should render header with app title', () => {
    renderWithRouter(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    expect(screen.getByText('家計簿')).toBeInTheDocument();
  });

  it('should render navigation links', () => {
    renderWithRouter(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    // Both desktop and mobile navigation have the same links
    expect(screen.getAllByRole('link', { name: /ダッシュボード/i })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /取引/i })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /レポート/i })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /口座/i })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /費目/i })).toHaveLength(2);
  });

  it('should render children in main content area', () => {
    renderWithRouter(
      <Layout>
        <div data-testid="test-child">Test Child Content</div>
      </Layout>
    );

    expect(screen.getByTestId('test-child')).toBeInTheDocument();
    expect(screen.getByText('Test Child Content')).toBeInTheDocument();
  });

  it('should have navigation links with correct hrefs', () => {
    renderWithRouter(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    // Check first (desktop) navigation link for each route
    expect(screen.getAllByRole('link', { name: /ダッシュボード/i })[0]).toHaveAttribute('href', '/');
    expect(screen.getAllByRole('link', { name: /取引/i })[0]).toHaveAttribute('href', '/transactions');
    expect(screen.getAllByRole('link', { name: /レポート/i })[0]).toHaveAttribute('href', '/reports');
    expect(screen.getAllByRole('link', { name: /口座/i })[0]).toHaveAttribute('href', '/accounts');
    expect(screen.getAllByRole('link', { name: /費目/i })[0]).toHaveAttribute('href', '/categories');
  });

  it('should render footer with copyright', () => {
    renderWithRouter(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    expect(screen.getByText(/家計簿アプリ/i)).toBeInTheDocument();
  });
});
