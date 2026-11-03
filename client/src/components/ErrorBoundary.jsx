import React from 'react';

// Tampilan cadangan bila komponen gagal dirender. Detail teknis hanya dicatat di console.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 16, fontFamily: 'sans-serif' }}>
          <div style={{ maxWidth: 420, width: '100%', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 10px 25px rgba(0,0,0,0.05)', textAlign: 'center' }}>
            <h2 style={{ color: '#0f172a', marginTop: 0, fontSize: 18 }}>Terjadi kesalahan</h2>
            <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>
              Halaman tidak dapat ditampilkan. Coba muat ulang halaman. Jika masih terjadi, keluar lalu login kembali.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 20 }}>
              <button
                onClick={this.handleReload}
                style={{ minHeight: 44, background: '#4f46e5', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 }}
              >
                Muat Ulang Halaman
              </button>
              <button
                onClick={this.handleReset}
                style={{ minHeight: 44, background: '#f1f5f9', color: '#334155', border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 }}
              >
                Keluar & Login Ulang
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
