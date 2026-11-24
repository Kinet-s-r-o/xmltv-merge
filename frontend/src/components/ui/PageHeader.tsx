import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
}

/** Page title, concrete description and the page's primary actions. */
export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="page-header-tools">{children}</div>}
    </header>
  )
}
