import { count, params } from "@nanostores/i18n";
import { i18n } from "./model/i18n.model";

export const authMessages = i18n("auth", {
  signingIn: "Signing in…",
  login: "Login with Spotify",
});

export const sidebarMessages = i18n("sidebar", {
  back: "Back",
  forward: "Forward",
  home: "Home",
  search: "Search",
  likedSongs: "Liked songs",
  playlists: "Playlists",
});

export const homeMessages = i18n("home", {
  title: "Home",
  notice:
    "The home feed — Discover Weekly, your daily mixes — comes from Spotify's internal API, which needs a sign-in of its own.",
  enable: "Enable home feed",
  retry: "Try again",
});

export const lyricsMessages = i18n("lyrics", {
  notice:
    "Spotify hands lyrics only to librespot's client, so they need a sign-in of their own.",
  enable: "Enable lyrics",
  loading: "Loading lyrics…",
  failed: params("Lyrics failed: {error}"),
  empty: "No lyrics for this track",
});

export const playerMessages = i18n("player", {
  shuffle: "Shuffle",
  repeat: "Repeat",
  previousTrack: "Previous track",
  playPause: "Play/pause",
  nextTrack: "Next track",
  seek: "Seek",
  toggleLyrics: "Toggle lyrics",
  toggleQueue: "Toggle queue",
  toggleFriends: "Toggle friend activity",
  nowPlaying: "Now playing",
  nextUp: "Next up",
  nothingPlaying: "Nothing playing",
  queueEmpty: "The queue is empty",
  removeFromQueue: "Remove from queue",
  album: "Album",
  duration: "Duration",
});

export const searchMessages = i18n("search", {
  placeholder: "Songs, artists, albums",
  nothingFound: "Nothing found",
  artists: "Artists",
  artist: "Artist",
  albums: "Albums",
  playlists: "Playlists",
  tracks: "Tracks",
});

export const libraryMessages = i18n("library", {
  play: "Play",
  shuffle: "Shuffle",
  likedSongs: "Liked songs",
  trackCount: count({ one: "{count} track", other: "{count} tracks" }),
  albums: "Albums",
  follow: "Follow",
  following: "Following",
  add: "Add",
  remove: "Remove",
  unfollow: "Unfollow",
  deletePlaylist: params("Delete playlist “{name}”?"),
  like: "Add to liked",
  unlike: "Remove from liked",
  columnTrack: "Track",
  columnAlbum: "Album",
  columnArtist: "Artist",
  columnDuration: "Time",
  columnAdded: "Added",
});

export const friendsMessages = i18n("friends", {
  title: "Friend activity",
  notice:
    "Friend activity comes from Spotify's internal API, which needs a sign-in of its own.",
  enable: "Enable friend activity",
  empty: "No friends listening right now",
  failed: params("Friend activity failed: {error}"),
});

export const userMessages = i18n("user", {
  publicPlaylists: "Public playlists",
  followers: count({ one: "{count} follower", other: "{count} followers" }),
});

export const menuMessages = i18n("menu", {
  play: "Play",
  open: "Open",
  copyLink: "Copy link",
  removeFromLibrary: "Remove from library",
  addToPlaylist: "Add to playlist",
  addToQueue: "Add to queue",
  removeFromPlaylist: "Remove from playlist",
  goToAlbum: "Go to album",
  goToArtist: "Go to artist",
});

export const profileMessages = i18n("profile", {
  theme: "Theme",
  language: "Language",
  logout: "Log out",
});
