import React, { useState, useEffect } from 'react';
import { Project, ProjectSnapshot } from '../types';
import {
  getStoredSnapshots,
  saveProjectSnapshot,
  deleteStoredSnapshot,
  scanBrowserStoragesForProjects,
  copyProjectToClipboard,
} from '../utils/backupUtils';
import {
  History,
  RotateCcw,
  Copy,
  Download,
  Trash2,
  X,
  AlertTriangle,
  Check,
  Search,
  ExternalLink,
  HardDrive,
  ShieldCheck,
} from 'lucide-react';

interface RecoveryModalProps {
  isOpen: boolean;
  currentProject: Project;
  onClose: () => void;
  onRestoreProject: (project: Project) => void;
}

export const RecoveryModal: React.FC<RecoveryModalProps> = ({
  isOpen,
  currentProject,
  onClose,
  onRestoreProject,
}) => {
  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([]);
  const [scannedItems, setScannedItems] = useState<
    { key: string; source: string; project: Project; taskCount: number }[]
  >([]);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'snapshots' | 'scan' | 'tips'>('snapshots');
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const stored = getStoredSnapshots();
      setSnapshots(stored);
      const found = scanBrowserStoragesForProjects();
      setScannedItems(found);
      setConfirmRestoreId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateManualSnapshot = () => {
    const updated = saveProjectSnapshot(currentProject, 'manual');
    setSnapshots(updated);
  };

  const handleDeleteSnapshot = (id: string) => {
    const updated = deleteStoredSnapshot(id);
    setSnapshots(updated);
  };

  const handleExecuteRestore = (projectToRestore: Project) => {
    onRestoreProject(projectToRestore);
    onClose();
  };

  const handleCopyCurrentJson = async () => {
    const ok = await copyProjectToClipboard(currentProject);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownloadJson = (proj: Project) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(proj, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `${(proj.title || 'proyecto').toLowerCase().replace(/\s+/g, '_')}_respaldo.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Centro de Respaldos y Recuperación
              </h2>
              <p className="text-xs text-slate-500">
                Restaura versiones anteriores guardadas automáticamente en tu navegador
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-white px-6 gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('snapshots')}
            className={`py-3 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'snapshots'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Versiones Guardadas ({snapshots.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('scan')}
            className={`py-3 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'scan'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Explorador de Almacenamiento ({scannedItems.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('tips')}
            className={`py-3 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'tips'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>¿Dónde están mis datos?</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: SNAPSHOTS */}
          {activeTab === 'snapshots' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 font-medium">
                  El sistema genera puntos de restauración cada vez que modificas tareas o cronogramas.
                </span>
                <button
                  onClick={handleCreateManualSnapshot}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-200 cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Crear Respaldo Ahora</span>
                </button>
              </div>

              {snapshots.length === 0 ? (
                <div className="text-center py-10 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No hay versiones automáticas registradas en este navegador</p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                    Si estuviste trabajando en otra pestaña o ventana (por ejemplo el enlace compartido o la vista previa), consulta la pestaña &quot;¿Dónde están mis datos?&quot;.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {snapshots.map((snap) => {
                    const hasMoreTasks = snap.taskCount > currentProject.tasks.length;
                    return (
                      <div
                        key={snap.id}
                        className={`p-3.5 rounded-xl border transition-all flex flex-wrap items-center justify-between gap-3 shadow-2xs ${
                          hasMoreTasks
                            ? 'border-amber-400 bg-amber-50/40 hover:border-amber-500'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-slate-900 truncate">
                              {snap.projectTitle}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                hasMoreTasks
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              {snap.taskCount} tareas
                            </span>
                            {hasMoreTasks && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                ✨ Versión con cronograma (+{snap.taskCount - currentProject.tasks.length} tareas)
                              </span>
                            )}
                            {snap.trigger === 'manual' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                Manual
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 mt-0.5 block">
                            Fecha y hora: {snap.dateStr}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {confirmRestoreId === snap.id ? (
                            <div className="flex items-center gap-1.5 bg-amber-50 p-1.5 rounded-xl border border-amber-300">
                              <span className="text-[10px] font-bold text-amber-900 px-1">
                                ¿Cargar {snap.taskCount} tareas?
                              </span>
                              <button
                                onClick={() => handleExecuteRestore(snap.project)}
                                className="px-2.5 py-1 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 cursor-pointer"
                              >
                                Sí, restaurar
                              </button>
                              <button
                                onClick={() => setConfirmRestoreId(null)}
                                className="px-2 py-1 text-slate-600 text-xs hover:bg-slate-200 rounded-lg cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => setConfirmRestoreId(snap.id)}
                                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer shadow-2xs ${
                                  hasMoreTasks
                                    ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                }`}
                                title="Restaura esta versión sobre el proyecto actual"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>{hasMoreTasks ? 'Recuperar Este Cronograma' : 'Restaurar'}</span>
                              </button>
                              <button
                                onClick={() => handleDownloadJson(snap.project)}
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                title="Descargar este punto como archivo JSON"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteSnapshot(snap.id)}
                                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Eliminar este respaldo"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: STORAGE SCANNER */}
          {activeTab === 'scan' && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
                Hemos examinado las claves internas de tu navegador por si existen datos bajo nombres anteriores o sesiones previas.
              </div>

              {scannedItems.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No se encontraron claves con datos de proyecto adicionales.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {scannedItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">
                            {item.project.title || 'Proyecto'}
                          </span>
                          <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                            {item.key}
                          </span>
                          <span className="text-[10px] text-slate-500 font-bold">
                            {item.taskCount} tareas
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          Almacén: {item.source}
                        </span>
                      </div>
                      <button
                        onClick={() => handleExecuteRestore(item.project)}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-200 cursor-pointer flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Cargar estos datos</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: WHERE ARE MY DATA & TIPS */}
          {activeTab === 'tips' && (
            <div className="space-y-3.5 text-xs text-slate-700 leading-relaxed">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-950">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>¿Por qué puede parecer que se perdieron los datos?</span>
                </div>
                <p className="text-[11px] text-amber-900 mt-1">
                  En los entornos de AI Studio, existen <strong>dos URLs diferentes</strong>:
                </p>
                <ul className="list-disc ml-5 mt-1.5 space-y-1 text-[11px] text-amber-900">
                  <li>
                    <strong>La ventana de desarrollo / editor</strong> (donde estás chateando conmigo).
                  </li>
                  <li>
                    <strong>El enlace compartido / pestaña externa</strong> (cuando pulsas el botón de abrir en nueva pestaña).
                  </li>
                </ul>
                <p className="text-[11px] text-amber-900 mt-2 font-semibold">
                  El navegador por seguridad (Same-Origin Policy) no comparte el almacenamiento entre dos URLs distintas. Si hiciste tus tareas en una pestaña externa, tus datos probablemente SIGUEN ESTANDO en esa otra pestaña o enlace.
                </p>
              </div>

              <div className="space-y-2 border border-slate-200 rounded-xl p-3.5 bg-white">
                <span className="font-bold text-slate-900 block text-xs">Pasos para recuperar tus datos de inmediato:</span>
                <ol className="list-decimal ml-5 space-y-1.5 text-slate-600 text-xs">
                  <li>
                    <strong>Revisa el historial de tu navegador:</strong> Busca si tienes abierta o en el historial reciente la pestaña donde creaste las tareas.
                  </li>
                  <li>
                    <strong>Verifica si usaste modo incógnito:</strong> Si creaste las tareas en una ventana privada y la cerraste, el navegador borra el almacenamiento automáticamente.
                  </li>
                  <li>
                    <strong>Comprueba otro navegador:</strong> Si estabas en Chrome y ahora abriste Edge, o viceversa, cada navegador tiene su propio almacenamiento local.
                  </li>
                </ol>
              </div>

              {/* Quick copy backup */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <span className="font-bold text-slate-900 block">Copia rápida al portapapeles</span>
                  <span className="text-[11px] text-slate-500">
                    Copia todo el estado actual en formato texto para no perder nada.
                  </span>
                </div>
                <button
                  onClick={handleCopyCurrentJson}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 cursor-pointer flex items-center gap-1.5 shadow-2xs transition-all"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-700">¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar JSON</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={handleCopyCurrentJson}
            className="text-xs text-slate-600 hover:text-slate-900 font-semibold cursor-pointer flex items-center gap-1"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado al portapapeles' : 'Copiar JSON actual'}</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
