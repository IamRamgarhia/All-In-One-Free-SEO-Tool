export type AuthBrandCopy = {
  appName: string;
  tagline: string;
  kicker: string;
  groupCredit: string;
  headlineAccent: string;
  headlineRest: string;
  pitch: string;
  features: { title: string; desc: string }[];
};

export type LoginPageCopy = {
  signInTitle: string;
  signInAccount: string;
  signInPassword: string;
  username: string;
  email: string;
  password: string;
  signIn: string;
  signingIn: string;
  loginFailed: string;
  wrongPassword: string;
  teamSetupBefore: string;
  teamSetupLink: string;
  teamSetupAfter: string;
  inviteAccountHint: string;
};

export type RegisterFormCopy = {
  email: string;
  password: string;
  yourName: string;
  namePlaceholder: string;
  passwordHint: string;
  passwordTooShort: string;
  registerFailed: string;
  creatingAccount: string;
  alreadyHaveAccount: string;
  goToSignIn: string;
};
