import pytest
from services.ebook.pipeline.chapter_structure_checker import (
    ChapterStructureChecker,
    ChapterStructureResult,
)

GOOD_CHAPTER = """
# The Power of Listening

Sarah stood at the whiteboard, marker in hand, when her phone buzzed with another urgent message she chose to ignore.
Her team had been trying to tell her something for months, and today she was finally going to hear it.
By the end of this chapter, you will know how to use structured listening to surface problems before they become crises.

## Why Leaders Stop Listening

Most leaders start their careers as good listeners. Then success happens.

When you get promoted, you suddenly have all the answers — or you're expected to. The pressure to look decisive crowds out the curiosity that got you there. Research from Harvard Business School found that executives interrupt 70% more in meetings than they did as individual contributors.

The result is a systematic information blackout at exactly the level where decisions matter most.

## The Listening Audit

Before you can fix your listening habits, you need to know what they actually are.

Spend one week tracking every meeting you attend. Mark each time you speak versus listen. Most leaders are shocked to find they talk for sixty percent or more of meeting time they're supposed to be facilitating.

A simple tally sheet works. Column A: minutes you spoke. Column B: minutes others spoke. The ratio tells you everything.

## Case Study: The Turnaround at Meridian

When Dana took over as regional director at Meridian Logistics, the team had 40% annual turnover.

Her predecessor had been a brilliant strategist who held all-hands meetings every Friday to share his vision. The problem: nobody felt heard. Dana's first act was to cancel the all-hands and replace it with thirty-minute individual listening sessions. Within six months, turnover dropped to 12%.

The situation: morale was at rock bottom and key people were leaving. Dana's action: systematic listening before any strategic changes. The result: a team that felt valued and a leader who finally understood the real problems.

## Key Takeaways

- Listening is a skill that degrades under pressure and must be deliberately rebuilt
- A listening audit reveals the gap between your self-image and your actual behavior
- Structural changes (listening sessions) outperform motivational speeches

## Action Steps

1. Schedule three thirty-minute listening sessions with direct reports this week
2. Complete a two-week listening audit using the tally method described above
3. Share your audit results with your team and ask for their honest reaction
"""

META_OPENER_CHAPTER = """
# Chapter 3: Communication Skills

In this chapter, we will explore the fundamentals of effective communication in the workplace.
This chapter covers topics including active listening, feedback delivery, and conflict resolution.

## Active Listening

Active listening means paying full attention to the speaker.
"""

FEW_H2_CHAPTER = """
# The Basics

Once upon a time there was a leader.

## One Section

That is all.
"""

MANY_H2_CHAPTER = "\n".join([f"## Section {i}\n\nContent here.\n" for i in range(12)])
MANY_H2_CHAPTER = "# Title\n\nOpening\n\n" + MANY_H2_CHAPTER

NO_CASE_STUDY_CHAPTER = """
# Productivity

Open with a story about focus.

## Deep Work

Deep work is the ability to focus.

## Shallow Work

Shallow work is distracting.

## Key Takeaways

- Focus matters

## Action Steps

1. Block calendar
"""


def test_narrative_hook_detected():
    checker = ChapterStructureChecker()
    result = checker.check(GOOD_CHAPTER)
    assert result.has_narrative_hook is True


def test_meta_opener_rejected():
    checker = ChapterStructureChecker()
    result = checker.check(META_OPENER_CHAPTER)
    assert len(result.prohibited_openers) > 0


def test_h2_count_too_low():
    checker = ChapterStructureChecker()
    result = checker.check(FEW_H2_CHAPTER)
    assert result.h2_count == 1
    assert result.structure_score < 0.8


def test_h2_count_too_high():
    checker = ChapterStructureChecker()
    result = checker.check(MANY_H2_CHAPTER)
    assert result.h2_count >= 9
    assert result.structure_score < 0.8


def test_case_study_detected():
    checker = ChapterStructureChecker()
    result = checker.check(GOOD_CHAPTER)
    assert result.has_case_study is True


def test_structure_score_perfect():
    checker = ChapterStructureChecker()
    result = checker.check(GOOD_CHAPTER)
    assert result.structure_score >= 0.85
