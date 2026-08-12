/**
 * Image handlers — Avatar management callbacks.
 *
 * Handles avatar_manage, avatar_add, avatar_view_, avatar_default_, avatar_delete_.
 */
import { AvatarService } from "@/services/avatar.service";
import { t } from "@/i18n/translations";
import { btnBackMain } from "./element-ui";
import type { BotContext } from "@/types";

export async function handleAvatarManage(ctx: BotContext): Promise<boolean> {
  const lang = ctx.session?.userLang || "id";
  const telegramId = BigInt(ctx.from!.id);
  const avatars = await AvatarService.listAvatars(telegramId);

  let message = t("cb.avatar_title", lang) + "\n\n";
  if (avatars.length === 0) {
    message += t("cb.avatar_empty", lang);
  } else {
    avatars.forEach((a, i) => {
      message += `${i + 1}. ${a.isDefault ? "⭐ " : ""}*${a.name}*\n`;
      if (a.description) message += `   _${a.description.slice(0, 80)}..._\n`;
    });
  }

  const avatarButtons = avatars.map((a) => [
    {
      text: `${a.isDefault ? "⭐ " : ""}${a.name}`,
      callback_data: `avatar_view_${a.id}`,
    },
  ]);

  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        ...avatarButtons,
        [{ text: t("btn.add_avatar", lang), callback_data: "avatar_add" }],
        [{ text: t("btn.back", lang), callback_data: "image_generate" }],
      ],
    },
  });
  return true;
}

export async function handleAvatarAdd(ctx: BotContext): Promise<boolean> {
  const lang = ctx.session?.userLang || "id";
  await ctx.editMessageText(t("cb.avatar_add", lang), {
    parse_mode: "Markdown",
  });
  ctx.session.state = "AVATAR_UPLOAD_WAITING";
  ctx.session.stateData = {};
  return true;
}

export async function handleAvatarView(
  ctx: BotContext,
  avatarId: number,
): Promise<boolean> {
  const avatar = await AvatarService.getAvatar(avatarId);
  if (!avatar) {
    const lang = ctx.session?.userLang || "id";
    await ctx.answerCbQuery(t("misc.avatar_not_found", lang));
    return true;
  }

  const lang = ctx.session?.userLang || "id";
  const defaultLabel = avatar.isDefault
    ? t("cb.avatar_is_default", lang) + "\n"
    : "";
  const descStr = avatar.description
    ? `_${avatar.description.slice(0, 300)}_\n\n`
    : "";

  await ctx.editMessageText(
    t("cb.avatar_view", lang, {
      name: avatar.name,
      defaultLabel,
      description: descStr,
    }),
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          ...(avatar.isDefault
            ? []
            : [
                [
                  {
                    text: t("btn.set_default", lang),
                    callback_data: `avatar_default_${avatar.id}`,
                  },
                ],
              ]),
          [
            {
              text: t("btn.delete", lang),
              callback_data: `avatar_delete_${avatar.id}`,
            },
          ],
          [{ text: t("btn.back", lang), callback_data: "avatar_manage" }],
        ],
      },
    },
  );
  return true;
}

export async function handleAvatarSetDefault(
  ctx: BotContext,
  avatarId: number,
): Promise<boolean> {
  const telegramId = BigInt(ctx.from!.id);
  const lang = ctx.session?.userLang || "id";

  await AvatarService.setDefault(telegramId, avatarId);
  await ctx.answerCbQuery(t("misc.avatar_set_default", lang));

  // Refresh the manage view
  return handleAvatarManage(ctx);
}

export async function handleAvatarDelete(
  ctx: BotContext,
  avatarId: number,
): Promise<boolean> {
  const telegramId = BigInt(ctx.from!.id);
  const lang = ctx.session?.userLang || "id";

  const deleted = await AvatarService.deleteAvatar(telegramId, avatarId);
  await ctx.answerCbQuery(
    deleted ? t("cb.avatar_deleted", lang) : t("cb.avatar_not_found_del", lang),
  );

  // Refresh the manage view
  return handleAvatarManage(ctx);
}
