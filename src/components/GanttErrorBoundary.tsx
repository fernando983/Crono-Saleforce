import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Wrench, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
  onClearPredecessors?: () => void;
  onResetView?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class GanttErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('GanttChart error intercepted:', error, errorInfo);
  }

  handleRepair = () => {
    if (this.props.onClearPredecessors) {
      this.props.onClearPredecessors();
    }
    this.setState({ hasError: false, error: undefined });
  };

  handleReload = () => {
    this.setState({ hasError: false, error: undefined });
    if (this.props.onResetView) {
      this.props.onResetView();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-amber-50/50 border border-amber-200 rounded-2xl text-center m-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center mb-4 shadow-xs">
            <Wrench className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">
            Recuperación del Gantt Interactivo
          </h3>
          <p className="text-xs text-slate-600 max-w-md mb-4 leading-relaxed">
            Se detectó un conflicto en el cálculo de fechas o dependencias circulares entre las tareas. Puedes solucionarlo al instante quitando todas las restricciones de predecesoras.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={this.handleRepair}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span>Quitar Todas las Predecesoras y Reparar</span>
            </button>
            <button
              onClick={this.handleReload}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl shadow-2xs cursor-pointer transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reintentar Carga</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
