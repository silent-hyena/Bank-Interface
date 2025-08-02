const { RateLimiterMongo } = require('rate-limiter-flexible');

let limiter;

function initRateLimiter(db,opCount,duration) {
  limiter = new RateLimiterMongo({
    storeClient: db,
    points: 3,
    duration: 5*60, 
    blockDuration: 2*60,
    keyPrefix: 'rl_makepayment',
  });
}

function getRateLimiter() {
  if (!limiter) {
    throw new Error("Rate limiter not initialized yet.");
  }
  return limiter;
}

module.exports = { initRateLimiter, getRateLimiter };
