import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Loader2, Save } from 'lucide-react';
import { api } from '../lib/api';
import { Avatar } from '../components/Avatar';

export function ProfilePage() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings() });
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [speciality, setSpeciality] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const s = settings.data;
  useEffect(() => {
    if (!s) return;
    setName(s.name ?? '');
    setSpeciality(s.speciality ?? '');
    setCountry(s.country ?? '');
    setCity(s.city ?? '');
    setWhatsapp(s.whatsappNumber ?? '');
  }, [s]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['settings'] });
    qc.invalidateQueries({ queryKey: ['me'] });
  };

  const saveProfile = useMutation({
    mutationFn: () => api.updateSettings({ name, speciality, country, city }),
    onSuccess: () => {
      refresh();
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    },
  });

  const savePref = useMutation({
    mutationFn: (patch: Partial<Parameters<typeof api.updateSettings>[0]>) => api.updateSettings(patch),
    onSuccess: refresh,
  });

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Escolhe uma imagem (PNG, JPG ou WEBP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('A imagem é demasiado grande (máx. 5 MB).');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      await api.uploadAvatar(file);
      refresh();
    } catch (err: any) {
      setError(err.message ?? 'Falha no upload da foto.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Perfil</h1>
        <p className="mt-1 text-sm text-slate-500">Os teus dados e as definições de partilha com colegas.</p>
      </div>

      {/* Avatar + identity */}
      <section className="card space-y-5">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar url={s?.avatarUrl} name={s?.name ?? name} size={72} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-primary-600 text-white shadow ring-2 ring-white"
              title="Mudar foto"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
          </div>
          <div>
            <p className="font-medium">{s?.name || 'Sem nome'}</p>
            <p className="text-sm text-slate-500">
              {[s?.speciality, s?.city].filter(Boolean).join(' · ') || 'Completa o teu perfil abaixo'}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome">
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. ..." />
          </Field>
          <Field label="Especialidade">
            <input
              className="input-field"
              value={speciality}
              onChange={(e) => setSpeciality(e.target.value)}
              placeholder="Ortodontia, Implantologia…"
            />
          </Field>
          <Field label="Cidade">
            <input className="input-field" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lisboa" />
          </Field>
          <Field label="País (código, ex. PT)">
            <input
              className="input-field"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="PT"
              maxLength={2}
            />
          </Field>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
            {saveProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar perfil
          </button>
          {savedNotice && <span className="text-sm text-emerald-600">Guardado.</span>}
        </div>
      </section>

      {/* Colleague / privacy settings */}
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Colegas e privacidade</h2>
        <p className="text-xs text-slate-500">
          Tudo desligado por defeito. Só partilhamos que guardaste um artigo (nunca as tuas notas).
        </p>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={s?.discoverable ?? true}
            onChange={(e) => savePref.mutate({ discoverable: e.target.checked })}
          />
          <span>
            <strong>Aparecer nas buscas de colegas</strong> (outros podem encontrar-te pelo nome para te
            adicionarem). O teu email nunca é mostrado.
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={s?.shareLibraryActivity ?? false}
            onChange={(e) => savePref.mutate({ shareLibraryActivity: e.target.checked })}
          />
          <span>
            <strong>Partilhar a minha atividade</strong> com os meus colegas (os artigos que guardo aparecem no feed
            deles).
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={s?.acceptPdfRequests ?? false}
            onChange={(e) => savePref.mutate({ acceptPdfRequests: e.target.checked })}
          />
          <span>
            <strong>Aceitar pedidos de PDF</strong> de colegas (recebes um aviso; a troca é por WhatsApp ou email,
            fora da plataforma).
          </span>
        </label>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Número de WhatsApp (para pedidos)</label>
          <div className="flex gap-2">
            <input
              className="input-field flex-1"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+351 912 345 678"
            />
            <button
              className="btn-ghost"
              onClick={() => savePref.mutate({ whatsappNumber: whatsapp })}
              disabled={savePref.isPending}
            >
              Guardar
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Sem número, os pedidos chegam-te por email. O contacto só é usado quando um colega te pede um PDF.
          </p>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
