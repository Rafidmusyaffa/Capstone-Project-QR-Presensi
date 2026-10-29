import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 20, fontFamily: 'sans-serif' }}>
          <div style={{ maxWidth: 600, width: '100%', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 30, boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}>
            <h2 style={{ color: '#e11d48', marginTop: 0 }}>Terjadi Kendala pada Tampilan</h2>
            <p style={{ color: '#64748b', fontSize: 14 }}>
              Aplikasi mengalami error saat merender komponen. Detail error:
            </p>
            <pre style={{ background: '#f1f5f9', color: '#334155', padding: 15, borderRadius: 10, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
              {this.state.error?.toString()}
            </pre>
            <button
              onClick={this.handleReset}
              style={{ marginTop: 20, background: '#4f46e5', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 'bold' }}
            >
              Reset Cache & Muat Ulang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
