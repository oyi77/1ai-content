/**
 * Image handlers — Avatar callback handlers
 *
 * Handles avatar_manage, avatar_add, avatar_view_*, avatar_default_*, avatar_delete_*,
 * and imgref_avatar_* callbacks.
 */
import { AvatarService } from '@/services/avatar.service';
import { t } from '@/i18n/translations';
import { btnBackMain } from './element-ui';
import type { BotContext } from '@/types';

/** avatar_manage — list avatars */
async function handleAvatarManage(ctx: BotContext): Promise<boolean> {
  const lang = ctx.session?.userLang || 'id';
  const telegramId = BigInt(ctx.from!.id);
  const avatars = await AvatarService.listAvatars(telegramId);

  let message = t('cb.avatar_title', lang) + '\n\n';
  if (avatars.length === 0) {
    message += t('cb.avatar_empty', lang);
  } else {
    avatars.forEach((a, i) => {
      message += `${i + 1}. ${a.isDefault ? '⭐ ' : ''}*${a.name}*\n`;
      if (a.description) message += `   _${a.description.slice(0, 80)}..._\n`;
    });
  }

  const avatarButtons = avatars.map((a) => [
    { text: `${a.isDefault ? '⭐ ' : ''}${a.name}`, callback_data: `avatar_view_${a.id}` },
  ]);

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        ...avatarButtons,
        [{ text: t('btn.add_avatar', lang), callback_data: 'avatar_add' }],
        [{ text: t('btn.back', lang), callback_data: 'image_generate' }],
      ],
    },
  });
  return true;
}

/** avatar_add — set state for upload */
async function handleAvatarAdd(ctx: BotContext): Promise<boolean> {
  const lang = ctx.session?.userLang || 'id';
  await ctx.editMessageText(t('cb.avatar_add', lang), { parse_mode: 'Markdown' });
  ctx.session.state = 'AVATAR_UPLOAD_WAITING';
  ctx.session.stateData = {};
  return true;
}

/** avatar_view_<id> — view avatar details */
async function handleAvatarView(ctx: BotContext, avatarId: number): Promise<boolean> {
  const avatar = await AvatarService.getAvatar(avatarId);
  if (!avatar) {
    const lang = ctx.session?.userLang || 'id';
    await ctx.answerCbQuery(t('misc.avatar_not_found', lang));
    return true;
  }

  const lang = ctx.session?.userLang || 'id';
  const defaultLabel = avatar.isDefault ? t('cb.avatar_is_default', lang) + '\n' : '';
  const descStr = avatar.description ? `_${avatar.description.slice(0, 300)}_\n\n` : '';

  await ctx.editMessageText(
    t('cb.avatar_view', lang, { name: avatar.name, defaultLabel, description: descStr }),
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          ...(avatar.isDefault
            ? []
            : [
              [{ text: t('btn.set_default', lang), callback_data: `avatar_default_${avatar.id}` }],
            ]),
          [{ text: t('btn.delete', lang), callback_data: `avatar_delete_${avatar.id}` }],
          [{ text: t('btn.back', lang), callback_data: 'avatar_manage' }],
        ],
      },
    },
  );
  return true;
}

/** avatar_default_<id> — set as default */
async function handleAvatarSetDefault(ctx: BotContext, avatarId: number): Promise<boolean> {
  const telegramId = BigInt(ctx.from!.id);
  await AvatarService.setDefault(telegramId, avatarId);
  const lang = ctx.session?.userLang || 'id';
  await ctx.answerCbQuery(t('misc.avatar_set_default', lang));

  // Refresh the list
  const avatars = await AvatarService.listAvatars(telegramId);
  let message = t('cb.avatar_title', lang) + '\n\n';
  avatars.forEach((a, i) => {
    message += `${i + 1}. ${a.isDefault ? '⭐ ' : ''}*${a.name}*\n`;
  });
  const avatarButtons = avatars.map((a) => [
    { text: `${a.isDefault ? '⭐ ' : ''}${a.name}`, callback_data: `avatar_view_${a.id}` },
  ]);
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        ...avatarButtons,
        [{ text: t('btn.add_avatar', lang), callback_data: 'avatar_add' }],
        [{ text: t('btn.back', lang), callback_data: 'image_generate' }],
      ],
    },
  });
  return true;
}

/** avatar_delete_<id> — delete avatar */
async function handleAvatarDelete(ctx: BotContext, avatarId: number): Promise<boolean> {
  const telegramId = BigInt(ctx.from!.id);
  const lang = ctx.session?.userLang || 'id';
  const deleted = await AvatarService.deleteAvatar(telegramId, avatarId);
  await ctx.answerCbQuery(
    deleted ? t('cb.avatar_deleted', lang) : t('cb.avatar_not_found_del', lang),
  );

  const avatars = await AvatarService.listAvatars(telegramId);
  let message = t('cb.avatar_title', lang) + '\n\n';
  if (avatars.length === 0) {
    message += t('cb.avatar_empty', lang);
  } else {
    avatars.forEach((a, i) => {
      message += `${i + 1}. ${a.isDefault ? '⭐ ' : ''}*${a.name}*\n`;
    });
  }
  const avatarButtons = avatars.map((a) => [
    { text: `${a.isDefault ? '⭐ ' : ''}${a.name}`, callback_data: `avatar_view_${a.id}` },
  ]);
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        ...avatarButtons,
        [{ text: t('btn.add_avatar', lang), callback_data: 'avatar_add' }],
        [{ text: t('btn.back', lang), callback_data: 'image_generate' }],
      ],
    },
  });
  return true;
}

/** imgref_avatar_<id> — select avatar as reference for IP adapter */
async function handleImgRefAvatar(ctx: BotContext, avatarId: number): Promise<boolean> {
  const avatar = await AvatarService.getAvatar(avatarId);
  if (!avatar) {
    const lang = ctx.session?.userLang || 'id';
    await ctx.answerCbQuery(t('misc.avatar_not_found', lang));
    return true;
  }

  ctx.session.state = 'IMAGE_GENERATION_WAITING';
  ctx.session.stateData = {
    ...ctx.session.stateData,
    avatarImageUrl: avatar.imageUrl,
    avatarId: avatar.id,
    avatarName: avatar.name,
    mode: 'ip_adapter',
  };

  const lang = ctx.session?.userLang || 'id';
  await ctx.editMessageText(
    t('cb.using_avatar', lang, { name: avatar.name }),
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[btnBackMain(lang)]] },
    },
  );
  return true;
}

// ── Public entry ──

/**
 * Route an avatar-related callback.
 * Returns true if handled, false if not recognized.
 */
export async function handleAvatarCallbacks(ctx: BotContext, data: string): Promise<boolean> {
  if (data === 'avatar_manage') return handleAvatarManage(ctx);
  if (data === 'avatar_add') return handleAvatarAdd(ctx);
  if (data.startsWith('avatar_view_')) return handleAvatarView(ctx, parseInt(data.replace('avatar_view_', ''), 10));
  if (data.startsWith('avatar_default_')) return handleAvatarSetDefault(ctx, parseInt(data.replace('avatar_default_', ''), 10));
  if (data.startsWith('avatar_delete_')) return handleAvatarDelete(ctx, parseInt(data.replace('avatar_delete_', ''), 10));
  if (data.startsWith('imgref_avatar_')) return handleImgRefAvatar(ctx, parseInt(data.replace('imgref_avatar_', ''), 10));
  return false;
}
