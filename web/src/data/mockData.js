/**
 * simulateSSEStream — typewriter animation helper.
 * Feeds text word-by-word with a small delay. Used to animate summaries
 * that arrive as a complete string rather than a live stream.
 * Returns a stop() function.
 */
export function simulateSSEStream(text, onChunk, onDone, delayMs = 30) {
  const words = text.split(" ");
  let i = 0;
  let stopped = false;

  function tick() {
    if (stopped || i >= words.length) {
      if (!stopped) onDone?.();
      return;
    }
    onChunk(words[i] + (i < words.length - 1 ? " " : ""));
    i++;
    setTimeout(tick, delayMs);
  }

  setTimeout(tick, 0);
  return () => {
    stopped = true;
  };
}
