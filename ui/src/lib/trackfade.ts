/**
 * trackfade.ts — GPU-composited track-change crossfade action.
 *
 * Why this instead of Svelte's `fade` transition on a `{#key}` block?
 *
 * Svelte's `fade` works via a JS `requestAnimationFrame` loop that sets `el.style.opacity`
 * on every frame. That is fine in isolation, but when a track changes, Svelte runs *many*
 * reactive effects at once (theme accent, artwork extraction, audio crossfade, queue update…)
 * which competes with the JS animation loop for the frame budget and causes visible jank.
 *
 * This action instead uses a **native CSS transition** (`transition: opacity Xms ease-in-out`)
 * and toggles a class to trigger it. The browser compositor handles the interpolation
 * entirely on the GPU thread — it never touches the JS thread after the initial class swap —
 * producing a silky smooth fade even under heavy JS load.
 *
 * Usage (Svelte 5):
 *   <div use:trackfade={videoId} style="will-change:opacity;contain:layout style paint">
 *     ...content keyed to videoId...
 *   </div>
 *
 * When `videoId` changes the action fades the element out, waits one frame (so Svelte can
 * update the children), then fades it back in.
 */

export interface TrackFadeOptions {
	/** Duration of the fade-out in ms (default 220). */
	outDuration?: number;
	/** Duration of the fade-in in ms (default 400). */
	inDuration?: number;
	/** Delay before the fade-in starts, in ms (default 60). */
	inDelay?: number;
}

/**
 * Svelte action that crossfades an element's opacity when `key` changes.
 * The element must have `will-change: opacity` in its style or class for GPU promotion.
 */
export function trackfade(
	el: HTMLElement,
	key: unknown,
	opts: TrackFadeOptions = {}
): { update(newKey: unknown): void; destroy(): void } {
	const { outDuration = 220, inDuration = 400, inDelay = 60 } = opts;

	// Apply CSS transition — this is what makes it run on the compositor.
	el.style.transition = `opacity ${outDuration}ms ease-in-out`;
	el.style.opacity = '1';

	let prevKey = key;
	let rafId = 0;
	let timeoutId = 0;

	function fadeOut(onDone: () => void) {
		// Cancel any in-flight animation.
		cancelAnimationFrame(rafId);
		clearTimeout(timeoutId);

		el.style.transition = `opacity ${outDuration}ms ease-in-out`;
		el.style.opacity = '0';

		// Wait for the CSS transition to finish, then call onDone.
		// Using setTimeout rather than `transitionend` because transitionend can be
		// skipped if the element is not visible or the transition is interrupted.
		timeoutId = window.setTimeout(onDone, outDuration);
	}

	function fadeIn() {
		// One rAF to let Svelte commit its DOM updates (new content is in the tree).
		rafId = requestAnimationFrame(() => {
			el.style.transition = `opacity ${inDuration}ms ease-in-out`;
			// Another rAF to ensure the opacity:0 frame was painted before we animate to 1.
			rafId = requestAnimationFrame(() => {
				timeoutId = window.setTimeout(() => {
					el.style.opacity = '1';
				}, inDelay);
			});
		});
	}

	return {
		update(newKey: unknown) {
			if (newKey === prevKey) return;
			prevKey = newKey;
			fadeOut(fadeIn);
		},
		destroy() {
			cancelAnimationFrame(rafId);
			clearTimeout(timeoutId);
		}
	};
}
