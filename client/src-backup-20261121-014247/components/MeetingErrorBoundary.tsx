import React from 'react';
import {AlertTriangle, ArrowLeft, ClipboardCopy, RefreshCcw} from 'lucide-react';

type Props = {children: React.ReactNode};
type State = {error: Error | null; details: string};

/** Keep failures in the meeting route visible instead of rendering a blank page. */
export class MeetingErrorBoundary extends React.Component<Props, State> {
  state: State = {error: null, details: ''};

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {error};
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Aurora Meet] Meeting rendering failed:', error, info.componentStack);
    this.setState({details: info.componentStack || ''});
  }

  render() {
    const {error, details} = this.state;
    if (!error) return this.props.children;
    const diagnostic = [
      `Aurora Meet meeting error: ${error.message}`,
      error.stack || '',
      details,
      `Browser: ${navigator.userAgent}`
    ].filter(Boolean).join('\n\n');
    return (
      <main className="meeting-error-screen" role="alert">
        <div className="meeting-error-card">
          <AlertTriangle size={38} color="#ffb477" aria-hidden />
          <h1>The meeting encountered an error</h1>
          <p>Your room is still saved. We couldn't display the meeting interface, but you can reload or return to the dashboard.</p>
          <div className="meeting-error-actions">
            <button onClick={() => window.location.reload()}><RefreshCcw size={17}/> Reload meeting</button>
            <button onClick={() => window.location.assign('/dashboard')}><ArrowLeft size={17}/> Dashboard</button>
            <button onClick={() => void navigator.clipboard?.writeText(diagnostic)}><ClipboardCopy size={17}/> Copy error details</button>
          </div>
          <details>
            <summary>Technical error (share this if the problem continues)</summary>
            <pre>{diagnostic}</pre>
          </details>
        </div>
      </main>
    );
  }
}
