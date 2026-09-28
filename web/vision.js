/* What each eye sees of an approaching object.
 *
 * This is the invented part of the model: it stands in for the optic
 * lobe, which sits in front of LC4 and LPLC2 and is not simulated.
 *
 * A fly's eyes face sideways with a narrow frontal overlap, so an object
 * to the left is seen almost entirely by the left eye.
 */

(function (global) {
  "use strict";

  // Half-width of the region both eyes see, in radians.
  var OVERLAP = 0.52;   // about 30 degrees either side of straight ahead

  /* Angular size of `obj` as seen from `fly`, split between the eyes.
   *
   * `heading` is where the fly is pointing, as a screen angle: 0 is up,
   * +PI/2 is right, -PI/2 is left. The eyes are defined relative to it,
   * so turning the fly turns which eye sees what.
   *
   * Returns { L, R } in radians, plus the geometry for display.
   */
  function look(fly, obj, heading) {
    var dx = obj.x - fly.x;
    var dy = obj.y - fly.y;

    var dist = Math.sqrt(dx * dx + dy * dy);
    var clear = Math.max(dist - obj.r, 1);

    // Angle subtended by the object at this distance.
    var theta = 2 * Math.atan(obj.r / clear);

    // Azimuth: 0 straight ahead, negative to the fly's left.
    var az = Math.atan2(dx, -dy) - (heading || 0);

    // Wrap into -PI..PI so the eye split stays correct behind the fly.
    while (az > Math.PI) az -= 2 * Math.PI;
    while (az < -Math.PI) az += 2 * Math.PI;

    var share;

    if (az <= -OVERLAP) share = 1;                       // fully left
    else if (az >= OVERLAP) share = 0;                   // fully right
    else share = 0.5 - az / (2 * OVERLAP);               // frontal overlap

    return {
      L: theta * share,
      R: theta * (1 - share),
      theta: theta,
      az: az,
      dist: dist
    };
  }

  global.Vision = { look: look, OVERLAP: OVERLAP };

})(typeof window !== "undefined" ? window : global);
