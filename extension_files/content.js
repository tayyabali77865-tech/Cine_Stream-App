// content.js

window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data?.type === "NETMIRROR_CHECK") {
    window.postMessage(
      {
        type: "NETMIRROR_EXTENSION_DETECTED",
        installed: true,
      },
      "*"
    );
  }
});
