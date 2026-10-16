// The same roasted-liver artwork as the app icon (build/liver-art.svg), without the tile.
import art from '../../build/liver-art.svg';

export function LiverLogo({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="170 70 760 700"
      role="img"
      aria-label="FriedLiver"
      // Static artwork from the repo, not user content.
      dangerouslySetInnerHTML={{ __html: art }}
    />
  );
}
