import { useId, type ReactNode } from 'react'
import standardPreview from './assets/preview-estandar.png'
import expertPreview from './assets/preview-experto.png'
import styles from './LandingPage.module.css'

type ViewLinkProps = {
  href: string
  className: string
  children: ReactNode
}

export type LandingPageProps = {
  standardHref: string
  expertHref: string
  homeHref?: string
  renderLink?: (props: ViewLinkProps) => ReactNode
}

const standardView = {
  title: 'Vista estándar',
  description: 'Elige un día, consulta una estación en el mapa y revisa la tendencia por hora.',
  image: standardPreview,
  imageAlt: 'Mapa de estaciones y fuentes de emisión con filtros de fecha',
}

const expertView = {
  title: 'Vista experta',
  description: 'Compara estaciones en un periodo y analiza correlaciones y fuentes industriales.',
  image: expertPreview,
  imageAlt: 'Mapa, medias móviles, matriz de correlación y gráficos de industrias',
}

export default function LandingPage({
  standardHref,
  expertHref,
  homeHref = '/',
  renderLink = ({ href, className, children }) => (
    <a href={href} className={className}>{children}</a>
  ),
}: LandingPageProps) {
  const titleId = useId()
  const chooserId = useId()
  const views = [
    { ...standardView, href: standardHref, cardClass: styles.card, buttonClass: styles.button },
    {
      ...expertView,
      href: expertHref,
      cardClass: `${styles.card} ${styles.expert}`,
      buttonClass: `${styles.button} ${styles.outline}`,
    },
  ]

  return (
    <div className={styles.page} lang="es">
      <header className={`${styles.masthead} ${styles.shell}`}>
        {renderLink({
          href: homeHref,
          className: styles.brand,
          children: (
            <>
              <span className={styles.brandMark} aria-hidden="true"><i /><i /><i /></span>
              Explorador de calidad del aire
            </>
          ),
        })}

        <span className={styles.region}>Colombia</span>
      </header>
      <main className={styles.shell}>
        <section className={styles.hero} aria-labelledby={titleId}>
          <div className={styles.heroArt} aria-hidden="true" />
          <h1 id={titleId} tabIndex={-1}>Calidad del aire <span>en Cundinamarca</span></h1>
          <p>Consulta las mediciones de las estaciones y explora las fuentes de emisión de la región.</p>
        </section>
        <section className={styles.chooser} aria-labelledby={chooserId}>
          <h2 id={chooserId}>Elige una vista</h2>
          <div className={styles.cards}>
            {views.map(view => (
              <article className={view.cardClass} key={view.title}>
                <div className={styles.preview}>
                  <img src={view.image} width={1080} height={415} alt={view.imageAlt} />
                </div>
                <div className={styles.cardBody}>
                  <h3>{view.title}</h3>
                  <p>{view.description}</p>
                  {renderLink({
                    href: view.href,
                    className: view.buttonClass,
                    children: `Abrir ${view.title.toLowerCase()}`,
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
