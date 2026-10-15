import { render } from '@testing-library/react';
import axe from 'axe-core';
import { useState } from 'react';
import { Button } from '../Button'; import { Card } from '../Card';
import { Input } from '../primitives/Input'; import { Badge } from '../primitives/Badge';
import { Avatar } from '../primitives/Avatar'; import { Toggle } from '../primitives/Toggle';
import { Tabs } from '../primitives/Tabs'; import { Stepper } from '../primitives/Stepper';
import { EmptyState } from '../primitives/EmptyState'; import { KpiCard } from '../data/KpiCard';
import { DataTable } from '../data/DataTable'; import { DayCell } from '../domain/DayCell';
import { AllergyBanner, SecurityGauge, RpeSlider } from '../domain/misc';
import { BookingCard } from '../domain/BookingCard';

async function expectNoViolations(el: HTMLElement) {
  const r = await axe.run(el, { rules: { 'color-contrast': { enabled: false } } }); // jsdom não calcula cor — contraste já provado por cálculo WCAG (P1.1)
  const serious = r.violations.filter(v => ['critical', 'serious'].includes(v.impact ?? ''));
  expect(serious.map(v => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
}

function Gallery() {
  const [tab, setTab] = useState('a'); const [on, setOn] = useState(true); const [rpe, setRpe] = useState(7);
  return (
    <main>
      <Button>Ação</Button><Badge variant="success">OK</Badge><Avatar name="Maria Santos" />
      <Card><Input label="Nome" helper="ajuda" /><Toggle checked={on} onChange={setOn} label="Notificações" /></Card>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'a', label: 'A', content: <p>a</p> }, { value: 'b', label: 'B', content: <p>b</p> }]} />
      <Stepper steps={['Atleta', 'Tipo', 'Hora']} current={1} />
      <EmptyState title="Sem dados" />
      <KpiCard label="Hoje" value={6} />
      <DataTable columns={[{ key: 'nome', header: 'Nome', sortable: true }]} rows={[{ id: 1, nome: 'Ana' }]} />
      <DayCell day={1} state="available" />
      <AllergyBanner allergies={[{ name: 'Amendoim', severity: 'severe' }]} />
      <SecurityGauge score={85} />
      <RpeSlider value={rpe} onChange={setRpe} />
      <BookingCard b={{ id: '1', athlete: 'Maria', time: '09:30', type: 'Treino', status: 'pending' }} />
    </main>
  );
}

describe('P1.12 — axe (sem violações critical/serious)', () => {
  it('galeria de componentes base + domínio', async () => {
    const { container } = render(<Gallery />);
    await expectNoViolations(container);
  }, 20000);
});
