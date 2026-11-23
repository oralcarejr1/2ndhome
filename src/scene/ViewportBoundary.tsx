import { Component, type ReactNode } from 'react';

/** Keep the editor usable if the browser cannot start or render the 3D scene. */
export class ViewportBoundary extends Component<
  { children: ReactNode; onOpenPlan: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="viewport-recovery" role="status">
        <h2>3D 화면을 표시할 수 없어요</h2>
        <p>2D 평면에서 배치와 가구 속성을 계속 편집할 수 있어요.</p>
        <div className="row">
          <button className="btn-primary" onClick={this.props.onOpenPlan}>2D 평면 열기</button>
          <button className="btn-secondary" onClick={() => this.setState({ failed: false })}>3D 다시 시도</button>
        </div>
      </div>
    );
  }
}
