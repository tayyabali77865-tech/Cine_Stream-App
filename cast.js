var artplayerPluginChromecast = (function () {
  "use strict";

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");

      script.src = src;
      script.async = true;

      script.onload = resolve;
      script.onerror = reject;

      document.body.appendChild(script);
    });
  }

  function getMimeType(url) {

    const extension = url
      .split("?")[0]
      .split("#")[0]
      .split(".")
      .pop()
      .toLowerCase();

    const mimeTypes = {
      mp4: "video/mp4",
      webm: "video/webm",
      ogg: "video/ogg",
      ogv: "video/ogg",
      mp3: "audio/mp3",
      wav: "audio/wav",
      flv: "video/x-flv",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      wmv: "video/x-ms-wmv",
      mpd: "application/dash+xml",
      m3u8: "application/x-mpegURL",
    };

    return (
      mimeTypes[extension] ||
      "application/octet-stream"
    );
  }

  function artplayerPluginChromecast2(
    option = {}
  ) {

    const DEFAULT_ICON = `
      <svg height="20" width="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512">
        <path fill="currentColor" d="M512 96H64v99c-13-2-26.4-3-40-3H0V96C0 60.7 28.7 32 64 32H512c35.3 0 64 28.7 64 64V416c0 35.3-28.7 64-64 64H288V456c0-13.6-1-27-3-40H512V96zM24 224c128.1 0 232 103.9 232 232c0 13.3-10.7 24-24 24s-24-10.7-24-24c0-101.6-82.4-184-184-184c-13.3 0-24-10.7-24-24s10.7-24 24-24zm8 192a32 32 0 1 1 0 64 32 32 0 1 1 0-64zM0 344c0-13.3 10.7-24 24-24c75.1 0 136 60.9 136 136c0 13.3-10.7 24-24 24s-24-10.7-24-24c0-48.6-39.4-88-88-88c-13.3 0-24-10.7-24-24z"/>
      </svg>
    `;

    const DEFAULT_SDK =
      "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";

    let isCastInitialized = false;
    let castSession = null;
    let castState = "disconnected";

    // =====================================
    // Button UI
    // =====================================

    function updateCastButton(state) {

      const button =
        document.querySelector(
          ".art-icon-cast"
        );

      if (!button) return;

      switch (state) {

        case "connected":
          button.style.color = "red";
          break;

        case "connecting":
        case "disconnecting":
          button.style.color = "orange";
          break;

        default:
          button.style.color = "white";
          break;
      }
    }

    // =====================================
    // Initialize Chromecast
    // =====================================

    function initializeCastApi() {

      return new Promise(
        (resolve, reject) => {

          window.__onGCastApiAvailable =
            function (isAvailable) {

              if (!isAvailable) {

                reject(
                  new Error(
                    "Cast API unavailable"
                  )
                );

                return;
              }

              try {

                const context =
                  window.cast.framework.CastContext.getInstance();

                context.setOptions({
                  receiverApplicationId:
                    window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,

                  autoJoinPolicy:
                    window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
                });

                // =========================
                // Session changes
                // =========================

                context.addEventListener(
                  window.cast.framework.CastContextEventType
                    .SESSION_STATE_CHANGED,

                  (event) => {

                    const SessionState =
                      window.cast.framework.SessionState;

                    castState =
                      event.sessionState;

                    switch (
                      event.sessionState
                    ) {

                      case SessionState.SESSION_STARTING:

                        updateCastButton(
                          "connecting"
                        );

                        option.onStateChange?.(
                          "connecting"
                        );

                        break;

                      case SessionState.SESSION_STARTED:
                      case SessionState.SESSION_RESUMED:

                        castSession =
                          context.getCurrentSession();

                        updateCastButton(
                          "connected"
                        );

                        // stop playback on mobile
                        if (
                          window.currentArtPlayer
                        ) {

                          try {

                            window.currentArtPlayer.pause();

                            if (
                              window.currentArtPlayer.video
                            ) {

                              window.currentArtPlayer.video.pause();
                            }

                            window.currentArtPlayer.muted = true;

                          } catch (e) {}
                        }

                        option.onStateChange?.(
                          "connected"
                        );

                        break;

                      case SessionState.SESSION_ENDING:

                        updateCastButton(
                          "disconnecting"
                        );

                        option.onStateChange?.(
                          "disconnecting"
                        );

                        break;

                      case SessionState.NO_SESSION:

                        castSession = null;

                        updateCastButton(
                          "disconnected"
                        );

                        // restore mobile playback
                        if (
                          window.currentArtPlayer
                        ) {

                          try {

                            window.currentArtPlayer.muted = false;

                          } catch (e) {}
                        }

                        option.onStateChange?.(
                          "disconnected"
                        );

                        break;
                    }
                  }
                );

                // =========================
                // Cast devices state
                // =========================

                context.addEventListener(
                  window.cast.framework.CastContextEventType
                    .CAST_STATE_CHANGED,

                  (event) => {

                    const CastState =
                      window.cast.framework.CastState;

                    switch (
                      event.castState
                    ) {

                      case CastState.NO_DEVICES_AVAILABLE:

                        option.onCastAvailable?.(
                          false
                        );

                        break;

                      default:

                        option.onCastAvailable?.(
                          true
                        );

                        break;
                    }
                  }
                );

                isCastInitialized = true;

                resolve();

              } catch (err) {

                reject(err);
              }
            };

          if (
            window.chrome &&
            window.chrome.cast &&
            window.cast &&
            window.cast.framework
          ) {

            window.__onGCastApiAvailable(
              true
            );

            return;
          }

          loadScript(
            option.sdk || DEFAULT_SDK
          ).catch(reject);
        }
      );
    }

    // =====================================
    // Get session
    // =====================================

    async function getSession(context) {

      let session =
        context.getCurrentSession();

      if (session) {
        return session;
      }

      await context.requestSession();

      session =
        context.getCurrentSession();

      if (!session) {

        throw new Error(
          "Failed to create cast session"
        );
      }

      return session;
    }

    // =====================================
    // Cast video
    // =====================================

    async function castVideo(art) {

      try {

        window.currentArtPlayer = art;

        const context =
          window.cast.framework.CastContext.getInstance();

        const session =
          await getSession(context);

        if (!session) {

          throw new Error(
            "No active cast session"
          );
        }

        // =========================
        // URL
        // =========================

        let url =
          option.url ||
          art.option.url;

        if (!url) {

          throw new Error(
            "Video URL missing"
          );
        }

        // =========================
        // Cast URL support
        // =========================

        if (
          typeof option.generateCastUrl ===
          "function"
        ) {

          url =
            await option.generateCastUrl(
              url
            );
        }

        const mimeType =
          option.mimeType ||
          getMimeType(url);

        // =========================
        // MediaInfo
        // =========================

        const mediaInfo =
          new window.chrome.cast.media.MediaInfo(
            url,
            mimeType
          );

        mediaInfo.streamType =
          window.chrome.cast.media.StreamType.BUFFERED;

        mediaInfo.metadata =
          new window.chrome.cast.media.GenericMediaMetadata();

        mediaInfo.metadata.title =
          option.title ||
          document.title ||
          "Video";

        if (
          option.poster ||
          art.poster
        ) {

          mediaInfo.metadata.images = [
            {
              url:
                option.poster ||
                art.poster,
            },
          ];
        }

        // =========================
        // Load request
        // =========================

        const request =
          new window.chrome.cast.media.LoadRequest(
            mediaInfo
          );

        request.autoplay = true;

        if (
          !isNaN(art.currentTime)
        ) {

          request.currentTime =
            art.currentTime;
        }

        // =========================
        // Start casting
        // =========================

        await session.loadMedia(
          request
        );

        // stop playback on phone
        art.pause();

        if (art.video) {
          art.video.pause();
        }

        art.muted = true;

        castSession = session;

        updateCastButton(
          "connected"
        );

        art.notice.show =
          "Casting started";

        option.onCastStart?.(
          session
        );

      } catch (error) {

        console.error(
          "Chromecast Error:",
          error
        );

        updateCastButton(
          "disconnected"
        );

        art.notice.show =
          error?.message ||
          "Error casting media";

        option.onError?.(
          error
        );
      }
    }

    // =====================================
    // Plugin
    // =====================================

    return async (art) => {

      art.controls.add({

        name: "chromecast",

        position: "right",

        tooltip: "Chromecast",

        html: `
          <i class="art-icon art-icon-cast">
            ${option.icon || DEFAULT_ICON}
          </i>
        `,

        click: async () => {

          try {

            if (
              !isCastInitialized
            ) {

              art.notice.show =
                "Initializing Chromecast...";

              await initializeCastApi();
            }

            await castVideo(art);

          } catch (error) {

            console.error(error);

            art.notice.show =
              error?.message ||
              "Failed to connect Chromecast";

            option.onError?.(
              error
            );
          }
        },
      });

      return {

        name:
          "artplayerPluginChromecast",

        getCastState: () =>
          castState,

        isCasting: () =>
          castSession !== null,

        getSession: () =>
          castSession,
      };
    };
  }

  return artplayerPluginChromecast2;
})();