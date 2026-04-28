import { scoreToRating } from '../score'

describe('scoreToRating - rating band boundaries', () => {
  describe('D / C boundary at 30', () => {
    it('maps 29.99 to D', () => {
      expect(scoreToRating(29.99)).toBe('D')
    })

    it('maps 30.00 to C', () => {
      expect(scoreToRating(30.00)).toBe('C')
    })

    it('maps 30.01 to C', () => {
      expect(scoreToRating(30.01)).toBe('C')
    })
  })

  describe('C / CC boundary at 36', () => {
    it('maps 35.99 to C', () => {
      expect(scoreToRating(35.99)).toBe('C')
    })

    it('maps 36.00 to CC', () => {
      expect(scoreToRating(36.00)).toBe('CC')
    })

    it('maps 36.01 to CC', () => {
      expect(scoreToRating(36.01)).toBe('CC')
    })
  })

  describe('CC / CCC boundary at 44', () => {
    it('maps 43.99 to CC', () => {
      expect(scoreToRating(43.99)).toBe('CC')
    })

    it('maps 44.00 to CCC', () => {
      expect(scoreToRating(44.00)).toBe('CCC')
    })

    it('maps 44.01 to CCC', () => {
      expect(scoreToRating(44.01)).toBe('CCC')
    })
  })

  describe('CCC / B boundary at 52', () => {
    it('maps 51.99 to CCC', () => {
      expect(scoreToRating(51.99)).toBe('CCC')
    })

    it('maps 52.00 to B', () => {
      expect(scoreToRating(52.00)).toBe('B')
    })

    it('maps 52.01 to B', () => {
      expect(scoreToRating(52.01)).toBe('B')
    })
  })

  describe('B / BB boundary at 60', () => {
    it('maps 59.99 to B', () => {
      expect(scoreToRating(59.99)).toBe('B')
    })

    it('maps 60.00 to BB', () => {
      expect(scoreToRating(60.00)).toBe('BB')
    })
  })

  describe('BB / BBB boundary at 68', () => {
    it('maps 67.99 to BB', () => {
      expect(scoreToRating(67.99)).toBe('BB')
    })

    it('maps 68.00 to BBB', () => {
      expect(scoreToRating(68.00)).toBe('BBB')
    })
  })

  describe('BBB / A boundary at 76', () => {
    it('maps 75.99 to BBB', () => {
      expect(scoreToRating(75.99)).toBe('BBB')
    })

    it('maps 76.00 to A', () => {
      expect(scoreToRating(76.00)).toBe('A')
    })
  })

  describe('A / AA boundary at 84', () => {
    it('maps 83.99 to A', () => {
      expect(scoreToRating(83.99)).toBe('A')
    })

    it('maps 84.00 to AA', () => {
      expect(scoreToRating(84.00)).toBe('AA')
    })
  })

  describe('AA / AAA boundary at 93', () => {
    it('maps 92.99 to AA', () => {
      expect(scoreToRating(92.99)).toBe('AA')
    })

    it('maps 93.00 to AAA', () => {
      expect(scoreToRating(93.00)).toBe('AAA')
    })
  })
})

describe('scoreToRating - representative values', () => {
  it('maps 0 to D', () => {
    expect(scoreToRating(0)).toBe('D')
  })

  it('maps 50 to CCC', () => {
    expect(scoreToRating(50)).toBe('CCC')
  })

  it('maps 70 to BBB', () => {
    expect(scoreToRating(70)).toBe('BBB')
  })

  it('maps 100 to AAA', () => {
    expect(scoreToRating(100)).toBe('AAA')
  })
})

describe('scoreToRating - DEKAM reference values', () => {
  it('maps DEKAM 2022 score 13.6 to D', () => {
    expect(scoreToRating(13.6)).toBe('D')
  })

  it('maps DEKAM 2023 score 18.8 to D', () => {
    expect(scoreToRating(18.8)).toBe('D')
  })

  it('maps DEKAM 2024 score 33.4 to C', () => {
    expect(scoreToRating(33.4)).toBe('C')
  })

  it('maps DEKAM 2025 Q4 score 56 to B', () => {
    expect(scoreToRating(56)).toBe('B')
  })
})

describe('scoreToRating - edge cases', () => {
  it('maps negative values to D', () => {
    expect(scoreToRating(-5)).toBe('D')
  })

  it('maps values above 100 to AAA', () => {
    expect(scoreToRating(150)).toBe('AAA')
  })

  it('maps positive infinity to AAA', () => {
    expect(scoreToRating(Number.POSITIVE_INFINITY)).toBe('AAA')
  })

  it('maps NaN to D', () => {
    expect(scoreToRating(Number.NaN)).toBe('D')
  })
})
