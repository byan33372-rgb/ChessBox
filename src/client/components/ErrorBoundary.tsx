import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** 全局错误边界：渲染异常时给出可操作的恢复界面，而不是白屏 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ui] 渲染异常:', error.message, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="room room-center" role="alert">
          <div className="card fatal-card">
            <h2>界面出现了一点问题</h2>
            <p className="hint">{this.state.error.message}</p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn primary" onClick={this.reset}>
                重试
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  window.location.href = '/';
                }}
              >
                回到首页
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  window.location.reload();
                }}
              >
                刷新页面
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
