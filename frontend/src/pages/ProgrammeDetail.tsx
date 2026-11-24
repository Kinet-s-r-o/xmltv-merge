import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowLeft, SearchX, Tv } from 'lucide-react'
import { api, type Credit, type Title } from '../api/client'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination, usePagedRows } from '../components/ui/Pagination'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../components/ui/ResourceState'
import { ColumnVisibilityCell, ColumnVisibilityHeader, TableCells, TableFilterSummary, TableHeaderCells, TableSearch, tableColumnSpan, useTableControls, type TableColumn } from '../components/ui/TableControls'

const CREDIT_COLUMNS: TableColumn<Credit>[] = [
  { id: 'role', label: 'Role', kind: 'text', value: (credit) => credit.type, cell: (credit) => <span className="table-text capitalize">{credit.type}</span> },
  { id: 'name', label: 'Name', kind: 'text', value: (credit) => credit.name },
]
const TITLE_COLUMNS: TableColumn<Title>[] = [
  { id: 'lang', label: 'Language', kind: 'text', value: (title) => title.lang, cell: (title) => <span className="table-text font-mono">{title.lang || '—'}</span> },
  { id: 'title', label: 'Title', kind: 'text', value: (title) => title.title },
]
const EMPTY_CREDITS: Credit[] = []
const EMPTY_TITLES: Title[] = []
const creditSearchText = (credit: Credit) => `${credit.type} ${credit.name}`
const titleSearchText = (title: Title) => `${title.lang ?? ''} ${title.title}`

export function ProgrammeDetail() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const backTo = (location.state as { from?: string } | null)?.from ?? '/epg'
  const programmeId = Number(id)
  const validProgrammeId = Number.isInteger(programmeId) && programmeId > 0

  const { data: programme, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['programme', programmeId],
    queryFn: () => api.programme(programmeId),
    enabled: validProgrammeId,
  })
  const creditTable = useTableControls(programme?.credits ?? EMPTY_CREDITS, CREDIT_COLUMNS, { searchText: creditSearchText, storageKey: 'programme-credits' })
  const titleTable = useTableControls(programme?.titles ?? EMPTY_TITLES, TITLE_COLUMNS, { searchText: titleSearchText, storageKey: 'programme-titles' })
  const credits = usePagedRows(creditTable.rows, 'xmltv-programme-credits-page-size', `${programmeId}|${creditTable.resetKey}`)
  const titles = usePagedRows(titleTable.rows, 'xmltv-programme-titles-page-size', `${programmeId}|${titleTable.resetKey}`)

  const backButton = (
    <button type="button" onClick={() => navigate(backTo)} className="btn btn-secondary">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {backTo.startsWith('/channels') ? 'Back to channels' : 'Back to EPG grid'}
    </button>
  )

  if (validProgrammeId && isLoading) {
    return (
      <>
        <PageHeader title="Programme detail">{backButton}</PageHeader>
        <section className="data-panel"><LoadingState title="Loading programme" /></section>
      </>
    )
  }

  if (!validProgrammeId || isError || !programme) {
    return (
      <>
        <PageHeader title="Programme detail">{backButton}</PageHeader>
        <section className="data-panel">
          {isError ? (
            <ResourceError title="Programme could not be loaded" message={errorMessage(error)} onRetry={() => refetch()} />
          ) : (
            <EmptyState
              icon={SearchX}
              title="Programme not found"
              message={`No stored programme has ID ${id ?? ''}. It may have ended and been removed by the source history cleanup.`}
            />
          )}
        </section>
      </>
    )
  }

  const primaryTitle = programme.titles?.[0]?.title || programme.subtitle || 'Untitled programme'

  return (
    <>
      <PageHeader
        title={primaryTitle}
        description={<span className="font-mono">{format(new Date(programme.start_time), 'yyyy-MM-dd HH:mm')}–{format(new Date(programme.stop_time), 'HH:mm')}{programme.channel?.name ? ` · ${programme.channel.name}` : ''}</span>}
      >
        {backButton}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <section className="data-panel" aria-labelledby="programme-description-title">
          <div className="data-panel-header">
            <div>
              <h2 id="programme-description-title">Description</h2>
              {programme.description_lang && <p className="font-mono">lang={programme.description_lang}</p>}
            </div>
          </div>
          <div className="data-panel-body flex flex-col gap-4 sm:flex-row">
            {programme.icon_url
              ? <img src={programme.icon_url} alt="" className="poster" />
              : <span className="poster" aria-hidden="true"><Tv className="h-[22px] w-[22px]" /></span>}
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {programme.categories && programme.categories.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Categories">
                  {programme.categories.map((category) => <li key={category.id} className="chip">{category.category}</li>)}
                </ul>
              )}
              {programme.description
                ? <p className="prose-text">{programme.description}</p>
                : <p className="text-[12px] text-muted">The XMLTV source provides no description for this programme.</p>}
            </div>
          </div>
        </section>

        <section className="data-panel" aria-labelledby="programme-meta-title">
          <div className="data-panel-header">
            <div>
              <h2 id="programme-meta-title">Programme metadata</h2>
              <p>Values as stored from the XMLTV source</p>
            </div>
          </div>
          <div className="data-panel-body">
            <dl className="meta-list">
              <dt>Channel</dt><dd>{programme.channel?.name ?? `Channel #${programme.channel_id}`}</dd>
              <dt>Source ID</dt><dd className="font-mono">{programme.source_id}</dd>
              <dt>Start</dt><dd className="font-mono">{format(new Date(programme.start_time), 'yyyy-MM-dd HH:mm')}</dd>
              <dt>Stop</dt><dd className="font-mono">{format(new Date(programme.stop_time), 'yyyy-MM-dd HH:mm')}</dd>
              {programme.subtitle && <><dt>Episode title</dt><dd>{programme.subtitle}</dd></>}
              {programme.episode_num && <><dt>Episode</dt><dd className="font-mono">{programme.episode_num}{programme.episode_num_system ? ` (${programme.episode_num_system})` : ''}</dd></>}
              {programme.country && <><dt>Country</dt><dd>{programme.country}</dd></>}
              {programme.year && <><dt>Year</dt><dd className="font-mono">{programme.year}</dd></>}
            </dl>
          </div>
        </section>
      </div>

      {programme.credits && programme.credits.length > 0 && (
        <section className="data-panel" aria-labelledby="programme-credits-title">
          <div className="table-panel-toolbar">
            <div>
              <h2 id="programme-credits-title">Credits</h2>
              <p className="font-mono">{creditTable.isFiltered ? `${creditTable.rows.length} of ${programme.credits.length}` : programme.credits.length} entries</p>
            </div>
            <TableSearch controls={creditTable} label="Search credits by role or name" placeholder="Search role or name" />
          </div>
          <TableFilterSummary controls={creditTable} />
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><TableHeaderCells controls={creditTable} /><ColumnVisibilityHeader controls={creditTable} /></tr></thead>
              <tbody>
                {credits.visible.length === 0 && (
                  <tr><td colSpan={tableColumnSpan(creditTable, 1)}><span className="table-text text-muted">No credit matches the current filters. </span><button type="button" className="btn-link" onClick={creditTable.clearAll}>Clear filters</button></td></tr>
                )}
                {credits.visible.map((credit) => (
                  <tr key={credit.id}>
                    <TableCells controls={creditTable} row={credit} />
                    <ColumnVisibilityCell />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...credits.paginationProps} itemLabel="credits" />
        </section>
      )}

      {programme.titles && programme.titles.length > 1 && (
        <section className="data-panel" aria-labelledby="programme-titles-title">
          <div className="table-panel-toolbar">
            <div>
              <h2 id="programme-titles-title">Titles by language</h2>
              <p className="font-mono">{titleTable.isFiltered ? `${titleTable.rows.length} of ${programme.titles.length}` : programme.titles.length} variants</p>
            </div>
            <TableSearch controls={titleTable} label="Search titles by language or text" placeholder="Search language or title" />
          </div>
          <TableFilterSummary controls={titleTable} />
          <table className="data-table">
            <thead><tr><TableHeaderCells controls={titleTable} /><ColumnVisibilityHeader controls={titleTable} /></tr></thead>
            <tbody>
              {titles.visible.length === 0 && (
                <tr><td colSpan={tableColumnSpan(titleTable, 1)}><span className="table-text text-muted">No title matches the current filters. </span><button type="button" className="btn-link" onClick={titleTable.clearAll}>Clear filters</button></td></tr>
              )}
              {titles.visible.map((title) => (
                <tr key={title.id}>
                  <TableCells controls={titleTable} row={title} />
                  <ColumnVisibilityCell />
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination {...titles.paginationProps} itemLabel="titles" />
        </section>
      )}
    </>
  )
}
