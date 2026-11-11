'use client';
import styles from './SpotifyPanelLink.module.css';
// A standard Spotify HTTPS link supports platform app links and retains a web fallback.
// It never invokes the player API or changes the selected playback device.
export default function SpotifyPanelLink(){return <a className={styles.link} href="https://open.spotify.com/" target="_blank" rel="noopener noreferrer" aria-label="Abrir Spotify em outra guia ou no aplicativo" title="Abrir Spotify ↗"/>;}
