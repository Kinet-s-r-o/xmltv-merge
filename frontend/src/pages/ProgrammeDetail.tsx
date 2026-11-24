import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowLeft, SearchX, Tv } from 'lucide-react'
import { api } from '../api/client'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination, usePagedRows } from '../components/ui/Pagination'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../components/ui/ResourceState'

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
  const credits = usePagedRows(programme?.credits ?? [], 'xmltv-programme-credits-page-size', programmeId)
  const titles = usePagedRows(programme?.titles ?? [], 'xmltv-programme-titles-page-size', programmeId)

  const backButton = (
    <button type="button" onClick={() => navigate(backTo)} className="btn btn-secondary">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to EPG grid
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
              <p className="font-mono">{programme.credits.length} entries</p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th scope="col">Role</th><th scope="col">Name</th></tr></thead>
              <tbody>
                {credits.visible.map((credit) => (
                  <tr key={credit.id}>
                    <td><span className="table-text capitalize">{credit.type}</span></td>
                    <td><span className="table-text">{credit.name}</span></td>
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
              <p className="font-mono">{programme.titles.length} variants</p>
            </div>
          </div>
          <table className="data-table">
            <thead><tr><th scope="col">Language</th><th scope="col">Title</th></tr></thead>
            <tbody>
              {titles.visible.map((title) => (
                <tr key={title.id}>
                  <td><span className="table-text font-mono">{title.lang || '—'}</span></td>
                  <td><span className="table-text">{title.title}</span></td>
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
