"use client";

import { useCallback, useMemo, useState } from "react";
import { CheckSquare, Trash2, UserMinus, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { OperationalCardPicker, type OperationalCard } from "@/components/cards/operational-card-picker";
import { CardTile } from "@/components/cards/card-tile";
import { CardTileGrid } from "@/components/cards/card-tile-grid";
import { CardListTable } from "@/components/cards/card-list-table";
import { CardSelectionBar, type SelectedCardEntry } from "@/components/cards/card-selection-bar";
import { FilterBar, type ViewType } from "@/components/filters/filter-bar";
import { useCardFacetSources } from "@/components/filters/card-filter-bar";
import { CallAssignModal } from "@/components/llamadas/call-assign-modal";
import { useCardSelection } from "@/lib/use-card-selection";
import { usePersistentState } from "@/lib/use-persistent-state";
import type { CardTileData } from "@/lib/cards/card-tile-data";
import { ASIGNADO_ME, buildCardFacets, pruneStatusesForProduct, type CardFacetKey } from "@/lib/filters/card-facets";
import { filterAssignCards } from "@/lib/llamadas/assign-filters";

/**
 * Calls overhaul: paste / scan a list of TC or cédulas (same resolution as
 * the operational picker used by rutas), select the resolved cards and
 * assign (or unassign) their call work to an operator.
 *
 * The resolved list and the selection are kept per user in local workspace
 * state (the same mechanism tarjetas uses for its selection) so a reload
 * does not lose a long paste. `asignadoA` is unknown until an action runs on
 * this screen: the search API does not return it.
 */

type AssignCard = OperationalCard & { asignadoA?: { id: string; name: string } | null };

type ModalMode = "assign" | "unassign";

const ASSIGN_VIEWS: ViewType[] = ["cards", "list"];
const ASSIGN_FACET_KEYS: CardFacetKey[] = ["asignado", "productType", "status", "provincia", "zona"];

function toTileData(card: AssignCard): CardTileData {
  return {
    id: card.id,
    tc: card.tc,
    nombre: card.customer.nombre,
    cedula: card.customer.cedula,
    provincia: card.provincia ?? "",
    zona: card.zona ?? "",
    status: card.status,
    isRemote: card.isRemote,
    asignadoA: card.asignadoA,
  };
}

export default function AsignarGestionesClient() {
  const [cards, setCards] = usePersistentState<AssignCard[]>("llamadas:asignar-cards", []);
  const selection = useCardSelection("llamadas:asignar-selection");
  const [query, setQuery] = useState("");
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [modalIds, setModalIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<ViewType>("cards");
  const { operadores } = useCardFacetSources(ASSIGN_FACET_KEYS);

  const visibleCards = useMemo(() => filterAssignCards(cards, filters), [cards, filters]);
  const facets = useMemo(() => {
    // Provinces come from the pasted cards. "Asignadas a mí" is left out:
    // this screen assigns work to others and does not know the session user.
    const provincias = [...new Set(cards.map((card) => card.provincia).filter((value): value is string => Boolean(value)))].sort();
    return buildCardFacets(ASSIGN_FACET_KEYS, { operadores, provincias, productType: filters.productType }).map((facet) =>
      facet.field === "asignado"
        ? { ...facet, options: facet.options?.filter((option) => option.value !== ASIGNADO_ME) }
        : facet,
    );
  }, [cards, operadores, filters.productType]);
  const handleFilterChange = useCallback(
    (next: Record<string, string>) => setFilters(pruneStatusesForProduct(next)),
    [],
  );

  function addCards(incoming: OperationalCard[]) {
    setCards((current) => {
      const known = new Set(current.map((card) => card.id));
      const fresh = incoming.filter((card) => !known.has(card.id));
      return fresh.length ? [...current, ...fresh] : current;
    });
  }

  const cardsById = useMemo(() => {
    const map: Record<string, SelectedCardEntry> = {};
    for (const card of cards) {
      map[card.id] = { id: card.id, tc: card.tc, customerName: card.customer.nombre, cedula: card.customer.cedula };
    }
    return map;
  }, [cards]);

  function openModal(mode: ModalMode) {
    // Freeze the target ids: the selection can change while the modal is open.
    setModalIds([...selection.ids]);
    setModalMode(mode);
  }

  function updateAssignee(ids: string[], asignadoA: AssignCard["asignadoA"]) {
    const target = new Set(ids);
    setCards((current) => current.map((card) => (target.has(card.id) ? { ...card, asignadoA } : card)));
  }

  function clearList() {
    setCards([]);
    selection.clear();
  }

  function removeCard(card: AssignCard) {
    setCards((current) => current.filter((item) => item.id !== card.id));
    if (selection.isSelected(card.id)) selection.toggle(card.id);
  }

  function setAllVisible(checked: boolean) {
    const ids = visibleCards.map((card) => card.id);
    if (checked) selection.selectMany(ids);
    else selection.deselectMany(ids);
  }

  const allSelected = visibleCards.length > 0 && visibleCards.every((card) => selection.isSelected(card.id));
  const emptyMessage = cards.length
    ? "Ninguna tarjeta de la lista coincide con los filtros."
    : "Aún no hay tarjetas. Pega una lista de TC o cédulas arriba.";
  const removeButton = (card: AssignCard) => (
    <button
      type="button"
      onClick={() => removeCard(card)}
      className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
    >
      Quitar de la lista
    </button>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Asignar gestiones de llamadas"
        subtitle="Pega o escanea TC / cédulas (una por línea, o separadas por coma o punto y coma), selecciona las tarjetas y asígnalas a un operario."
      />

      <Panel>
        <OperationalCardPicker
          multiline
          value={query}
          onValueChange={setQuery}
          onCardSelected={(card) => addCards([card])}
          onCardsSelected={addCards}
          placeholder={"Pega aquí la lista de TC o cédulas...\nCtrl+Enter para buscar"}
          buttonLabel="Buscar y agregar"
          inputLabel="Lista de TC o cédulas"
          autoFocus
        />
      </Panel>

      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Tarjetas en la lista (
            {visibleCards.length === cards.length ? cards.length : `${visibleCards.length} de ${cards.length}`})
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAllVisible(!allSelected)}
              disabled={!visibleCards.length}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {allSelected ? "Deseleccionar todas" : "Seleccionar todas"}
            </button>
            <button
              type="button"
              onClick={clearList}
              disabled={!cards.length}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Vaciar lista
            </button>
          </div>
        </div>

        <FilterBar
          className="mb-4"
          resource="llamadas-asignar"
          sectionKey="llamadas-asignar"
          filters={filters}
          onFilterChange={handleFilterChange}
          onReset={() => setFilters({})}
          facets={facets}
          searchPlaceholder="Filtrar por TC, cédula o nombre..."
          allowedViews={ASSIGN_VIEWS}
          currentView={viewMode}
          onViewChange={setViewMode}
        />

        {viewMode === "list" ? (
          <CardListTable
            items={visibleCards.map((card) => ({ ...toTileData(card), card }))}
            getKey={(item) => item.id}
            emptyMessage={emptyMessage}
            selection={{
              isSelected: (item) => selection.isSelected(item.id),
              toggle: (item) => selection.toggle(item.id),
              setAll: setAllVisible,
            }}
            renderActions={(item) => removeButton(item.card)}
          />
        ) : (
          <CardTileGrid
            items={visibleCards}
            getKey={(card) => card.id}
            emptyMessage={emptyMessage}
            renderItem={(card) => (
              <CardTile
                data={toTileData(card)}
                selection={{ checked: selection.isSelected(card.id), onToggle: () => selection.toggle(card.id) }}
                actions={removeButton(card)}
              />
            )}
          />
        )}
      </Panel>

      <CardSelectionBar
        count={selection.count}
        selectedIds={selection.ids}
        cardsById={cardsById}
        onClear={selection.clear}
        onDeselect={selection.toggle}
        actions={
          <>
            <button
              type="button"
              onClick={() => openModal("assign")}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Asignar a operario
            </button>
            <button
              type="button"
              onClick={() => openModal("unassign")}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              <UserMinus className="h-3.5 w-3.5" />
              Quitar asignación
            </button>
          </>
        }
      />

      {modalMode ? (
        <CallAssignModal
          cardIds={modalIds}
          mode={modalMode}
          onClose={() => setModalMode(null)}
          onAssigned={(result) => updateAssignee(modalIds, result.asignadoA)}
          onUnassigned={() => updateAssignee(modalIds, null)}
        />
      ) : null}
    </div>
  );
}
