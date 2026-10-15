import { useState } from 'react';
import {
  Button, Card, Input, Badge, Avatar, Skeleton, Toggle, EmptyState,
  Modal, BottomSheet, ResponsiveShell, useLayout,
  Tabs, KpiCard, DayCell, SwipeableCard, BookingCard, RestTimer, SessionClock,
  LiveButton, AllergyBanner, SecurityGauge, RpeSlider, Toaster, type DayState,
} from '@luna/ui';
import { toast, spikeTimer } from '@luna/core';

/** P1.14 — POC do GATE G1: layout fiel ao HTML (topbar · side|main|board · mobile-actions). */
function TimerDemo() {
  const [rest, setRest] = useState<ReturnType<typeof spikeTimer.start> | null>(null);
  const [session] = useState(() => spikeTimer.start(60 * 60_000));
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-8)', alignItems: 'center', flexWrap: 'wrap' }}>
      <div><span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Sessão</span><br /><SessionClock state={session} /></div>
      {rest
        ? <RestTimer state={rest} onDone={() => { setRest(null); toast({ variant: 'info', title: 'Descanso terminado' }); }} />
        : <LiveButton onClick={() => setRest(spikeTimer.start(10_000))}>Descanso 10s</LiveButton>}
    </div>
  );
}

function Controls() {
  const { strategy, setOverride } = useLayout();
  return (
    <Card elevated>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', marginTop: 0 }}>
        Estratégia de layout (config, não código)
      </h2>
      <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <Button variant={strategy.shell === 'sidebar' ? 'primary' : 'secondary'}
                onClick={() => setOverride({ shell: 'sidebar', aside: 'right' })}>Desktop (sidebar+board)</Button>
        <Button variant={strategy.shell === 'collapsed' ? 'primary' : 'secondary'}
                onClick={() => setOverride({ shell: 'collapsed', aside: 'hidden' })}>Mobile (HTML &lt;960)</Button>
        <Button variant={strategy.density === 'compact' ? 'primary' : 'secondary'}
                onClick={() => setOverride({ density: strategy.density === 'compact' ? 'comfortable' : 'compact' })}>
          Densidade: {strategy.density}
        </Button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', marginBottom: 0 }}>
        Fidelidade HTML: sem bottom-nav; mobile usa .mobile-actions + ⌘K para navegar.
      </p>
    </Card>
  );
}

function DemoContent() {
  const [modal, setModal] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [on, setOn] = useState(true);
  const [name, setName] = useState('');
  const [tab, setTab] = useState('health');
  const [rpe, setRpe] = useState(7);
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-6)' }}>
      <Controls />
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
          <Avatar name="Maria Santos" size="lg" />
          <div>
            <strong style={{ fontFamily: 'var(--font-display)' }}>Maria Santos</strong>
            <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-1)' }}>
              <Badge variant="accent">Treino</Badge><Badge variant="warning">Pendente</Badge>
            </div>
          </div>
        </div>
        <Input label="Nome do atleta" value={name} onChange={(e) => setName(e.target.value)}
               error={name.length > 0 && name.length < 3 ? 'Mínimo 3 caracteres' : undefined}
               helper="Validação ao vivo (RHF/Zod entram na F2)" />
        <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)', flexWrap: 'wrap' }}>
          <Button onClick={() => setModal(true)}>Abrir Modal</Button>
          <Button variant="secondary" onClick={() => setSheet(true)}>Abrir Sheet</Button>
          <Toggle checked={on} onChange={setOn} label="Notificações" />
        </div>
      </Card>
      <Card><Skeleton height={14} /><div style={{ height: 'var(--sp-2)' }} /><Skeleton height={14} width="70%" /></Card>
      <EmptyState title="Sem marcações hoje" hint="Quando criares uma, aparece aqui."
                  action={<Button size="sm">Agendar</Button>} />
      <Card>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', marginTop: 0 }}>KPIs + marcações (Dashboard preview)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
          <KpiCard label="Hoje" value={6} hint="marcações" />
          <KpiCard label="Pendentes" value={2} />
          <KpiCard label="Atletas" value={24} hint="ativos" />
        </div>
        <SwipeableCard actions={[
          { label: 'OK', onAct: () => toast({ variant: 'success', title: 'Marcação confirmada' }) },
          { label: 'Cancelar', onAct: () => toast({ variant: 'danger', title: 'Marcação cancelada' }), danger: true },
        ]}>
          <BookingCard b={{ id: '1', athlete: 'Maria Santos', time: '09:30', type: 'Treino', status: 'pending' }} />
        </SwipeableCard>
      </Card>
      <Card>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', marginTop: 0 }}>Calendário — 9 estados</h2>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          {(['available','booked','pending','blocked','holiday','dayoff','vacation','competition','travel'] as DayState[])
            .map((st, i) => <DayCell key={st} day={i + 1} state={st} selected={i === 1} />)}
        </div>
      </Card>
      <Card>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', marginTop: 0 }}>Live — timers</h2>
        <TimerDemo />
      </Card>
      <Card>
        <Tabs value={tab} onChange={setTab} items={[
          { value: 'health', label: 'Saúde', content: <AllergyBanner allergies={[{ name: 'Amendoim', severity: 'severe' }]} /> },
          { value: 'security', label: 'Segurança', content: <SecurityGauge score={85} /> },
          { value: 'rpe', label: 'RPE', content: <RpeSlider value={rpe} onChange={setRpe} /> },
        ]} />
      </Card>
      <Modal open={modal} onClose={() => setModal(false)} title="Confirmar marcação"
             footer={<><Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
                       <Button onClick={() => setModal(false)}>Confirmar</Button></>}>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Focus-trap, ESC e devolução de foco — testados.</p>
      </Modal>
      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Painel">
        <p style={{ color: 'var(--text-secondary)' }}>Sheet mobile (board oculto &lt;960).</p>
        <Button onClick={() => setSheet(false)}>Fechar</Button>
      </BottomSheet>
    </div>
  );
}

export function Poc() {
  return (
    <div data-module="dashboard" style={{ ['--accent-module' as string]: 'var(--gold)' }}>
      <Toaster />
      <ResponsiveShell
        nav={<span style={{ padding: 8 }}>Nav POC</span>}
        header={<strong style={{ fontFamily: 'var(--font-display)' }}>LUNA.OS — POC G1</strong>}
        topActions={<Button variant="secondary" size="sm">Tutorial</Button>}
        content={<DemoContent />}
        aside={<Card elevated><strong>Board</strong><p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
          Painel direito (desktop ≥960)</p></Card>}
        mobileActions={<><Button variant="secondary" style={{ flex: 1 }}>Ações</Button><Button style={{ flex: 1 }}>Atribuir</Button></>}
      />
    </div>
  );
}
