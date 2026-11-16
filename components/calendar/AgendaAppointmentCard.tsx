'use client';

import type {CalendarEvent} from '@/types/models';
import styles from './AgendaAppointmentCard.module.css';

type Props = {
  event: CalendarEvent;
  time: string;
  endTime: string;
  dateLabel?: string;
  fixed?: boolean;
  coincides?: boolean;
  week?: boolean;
  onOpen: () => void;
};

/** Presentation only. The agenda retains ownership of event identity and actions. */
export default function AgendaAppointmentCard({event,time,endTime,dateLabel,fixed=false,coincides=false,week=false,onOpen}:Props) {
  const kind = fixed ? 'Compromisso fixo' : 'Compromisso';
  const duration = event.allDay ? 'Dia inteiro' : `${time}–${endTime}`;
  return <article className={`${styles.card} ${week ? styles.week : ''}`} data-agenda-appointment={event.id} data-fixed-occurrence={fixed ? event.id : undefined}>
    <button type="button" className={styles.open} onClick={onOpen} aria-label={`${event.summary}, ${kind.toLowerCase()}, ${dateLabel ? dateLabel + ', ' : ''}${duration}. Abrir detalhes`}>
      <span className={styles.time}>{dateLabel ? <small>{dateLabel}</small> : null}<strong>{time}</strong></span>
      <span className={styles.content}>
        <span className={styles.heading}><svg className={styles.icon} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16"/></svg><strong>{event.summary}</strong></span>
        <small className={styles.meta}>{kind} · {duration}{coincides ? ' · coincide com outro compromisso' : ''}</small>
        {event.location ? <small className={styles.location} title={event.location}>{event.location}</small> : null}
      </span>
    </button>
    {!week && event.htmlLink?.startsWith('https://') ? <a className={styles.google} href={event.htmlLink} target="_blank" rel="noreferrer" aria-label={`Abrir ${event.summary} no Google Calendar`}>Google ↗</a> : null}
  </article>;
}
