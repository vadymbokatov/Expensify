import {useNavigation} from '@react-navigation/native';
import type {StackNavigationProp, StackScreenProps} from '@react-navigation/stack';
import Str from 'expensify-common/lib/str';
import React, {useEffect, useMemo, useState} from 'react';
import type {SectionListData} from 'react-native';
import {View} from 'react-native';
import {withOnyx} from 'react-native-onyx';
import type {OnyxEntry} from 'react-native-onyx';
import FullPageNotFoundView from '@components/BlockingViews/FullPageNotFoundView';
import FormAlertWithSubmitButton from '@components/FormAlertWithSubmitButton';
import HeaderWithBackButton from '@components/HeaderWithBackButton';
import ScreenWrapper from '@components/ScreenWrapper';
import SelectionList from '@components/SelectionList';
import type {Section} from '@components/SelectionList/types';
import useLocalize from '@hooks/useLocalize';
import useNetwork from '@hooks/useNetwork';
import useThemeStyles from '@hooks/useThemeStyles';
import * as DeviceCapabilities from '@libs/DeviceCapabilities';
import * as LoginUtils from '@libs/LoginUtils';
import Navigation from '@libs/Navigation/Navigation';
import * as OptionsListUtils from '@libs/OptionsListUtils';
import type {MemberForList} from '@libs/OptionsListUtils';
import {parsePhoneNumber} from '@libs/PhoneNumber';
import * as PolicyUtils from '@libs/PolicyUtils';
import type {OptionData} from '@libs/ReportUtils';
import type {SettingsNavigatorParamList} from '@navigation/types';
import * as Policy from '@userActions/Policy';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type SCREENS from '@src/SCREENS';
import type {Beta, InvitedEmailsToAccountIDs, PersonalDetailsList} from '@src/types/onyx';
import type {Errors} from '@src/types/onyx/OnyxCommon';
import {isEmptyObject} from '@src/types/utils/EmptyObject';
import SearchInputManager from './SearchInputManager';
import withPolicyAndFullscreenLoading from './withPolicyAndFullscreenLoading';
import type {WithPolicyAndFullscreenLoadingProps} from './withPolicyAndFullscreenLoading';

type MembersSection = SectionListData<MemberForList, Section<MemberForList>>;

type WorkspaceInvitePageOnyxProps = {
    /** All of the personal details for everyone */
    personalDetails: OnyxEntry<PersonalDetailsList>;

    /** Beta features list */
    betas: OnyxEntry<Beta[]>;

    /** An object containing the accountID for every invited user email */
    invitedEmailsToAccountIDsDraft: OnyxEntry<InvitedEmailsToAccountIDs>;
};

type WorkspaceInvitePageProps = WithPolicyAndFullscreenLoadingProps & WorkspaceInvitePageOnyxProps & StackScreenProps<SettingsNavigatorParamList, typeof SCREENS.WORKSPACE.INVITE>;

function WorkspaceInvitePage({
    route,
    policyMembers,
    personalDetails: personalDetailsProp,
    betas,
    invitedEmailsToAccountIDsDraft,
    policy,
    isLoadingReportData = true,
}: WorkspaceInvitePageProps) {
    const styles = useThemeStyles();
    const {translate} = useLocalize();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOptions, setSelectedOptions] = useState<MemberForList[]>([]);
    const [personalDetails, setPersonalDetails] = useState<OptionData[]>([]);
    const [usersToInvite, setUsersToInvite] = useState<OptionData[]>([]);
    const [didScreenTransitionEnd, setDidScreenTransitionEnd] = useState(false);
    const navigation = useNavigation<StackNavigationProp<SettingsNavigatorParamList, typeof SCREENS.WORKSPACE.INVITE>>();
    const openWorkspaceInvitePage = () => {
        const policyMemberEmailsToAccountIDs = PolicyUtils.getMemberAccountIDsForWorkspace(policyMembers, personalDetailsProp);
        Policy.openWorkspaceInvitePage(route.params.policyID, Object.keys(policyMemberEmailsToAccountIDs));
    };

    useEffect(() => {
        setSearchTerm(SearchInputManager.searchInput);
        return () => {
            Policy.setWorkspaceInviteMembersDraft(route.params.policyID, {});
        };
    }, [route.params.policyID]);

    useEffect(() => {
        Policy.clearErrors(route.params.policyID);
        openWorkspaceInvitePage();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- policyID changes remount the component
    }, []);

    useEffect(() => {
        const unsubscribeTransitionEnd = navigation.addListener('transitionEnd', () => {
            setDidScreenTransitionEnd(true);
        });

        return () => {
            unsubscribeTransitionEnd();
        };
        // Rule disabled because this effect is only for component did mount & will component unmount lifecycle event
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useNetwork({onReconnect: openWorkspaceInvitePage});

    const excludedUsers = useMemo(() => PolicyUtils.getIneligibleInvitees(policyMembers, personalDetailsProp), [policyMembers, personalDetailsProp]);

    useEffect(() => {
        const newUsersToInviteDict: Record<number, OptionData> = {};
        const newPersonalDetailsDict: Record<number, OptionData> = {};
        const newSelectedOptionsDict: Record<number, MemberForList> = {};

        const inviteOptions = OptionsListUtils.getMemberInviteOptions(personalDetailsProp, betas ?? [], searchTerm, excludedUsers, true);

        // Update selectedOptions with the latest personalDetails and policyMembers information
        const detailsMap: Record<string, MemberForList> = {};
        inviteOptions.personalDetails.forEach((detail) => {
            if (!detail.login) {
                return;
            }

            detailsMap[detail.login] = OptionsListUtils.formatMemberForList(detail);
        });

        const newSelectedOptions: MemberForList[] = [];
        Object.keys(invitedEmailsToAccountIDsDraft ?? {}).forEach((login) => {
            if (!(login in detailsMap)) {
                return;
            }
            newSelectedOptions.push({...detailsMap[login], isSelected: true});
        });
        selectedOptions.forEach((option) => {
            newSelectedOptions.push(option.login && option.login in detailsMap ? {...detailsMap[option.login], isSelected: true} : option);
        });

        const userToInvite = inviteOptions.userToInvite;

        // Only add the user to the invites list if it is valid
        if (typeof userToInvite?.accountID === 'number') {
            newUsersToInviteDict[userToInvite.accountID] = userToInvite;
        }

        // Add all personal details to the new dict
        inviteOptions.personalDetails.forEach((details) => {
            if (typeof details.accountID !== 'number') {
                return;
            }
            newPersonalDetailsDict[details.accountID] = details;
        });

        // Add all selected options to the new dict
        newSelectedOptions.forEach((option) => {
            if (typeof option.accountID !== 'number') {
                return;
            }
            newSelectedOptionsDict[option.accountID] = option;
        });

        // Strip out dictionary keys and update arrays
        setUsersToInvite(Object.values(newUsersToInviteDict));
        setPersonalDetails(Object.values(newPersonalDetailsDict));
        setSelectedOptions(Object.values(newSelectedOptionsDict));

        // eslint-disable-next-line react-hooks/exhaustive-deps -- we don't want to recalculate when selectedOptions change
    }, [personalDetailsProp, policyMembers, betas, searchTerm, excludedUsers]);

    const sections: MembersSection[] = useMemo(() => {
        const sectionsArr: MembersSection[] = [];
        let indexOffset = 0;

        if (!didScreenTransitionEnd) {
            return [];
        }

        // Filter all options that is a part of the search term or in the personal details
        let filterSelectedOptions = selectedOptions;
        if (searchTerm !== '') {
            filterSelectedOptions = selectedOptions.filter((option) => {
                const accountID = option.accountID;
                const isOptionInPersonalDetails = Object.values(personalDetails).some((personalDetail) => personalDetail.accountID === accountID);
                const parsedPhoneNumber = parsePhoneNumber(LoginUtils.appendCountryCode(Str.removeSMSDomain(searchTerm)));
                const searchValue = parsedPhoneNumber.possible ? parsedPhoneNumber.number?.e164 ?? '' : searchTerm.toLowerCase();

                const isPartOfSearchTerm = !!option.text?.toLowerCase().includes(searchValue) || !!option.login?.toLowerCase().includes(searchValue);
                return isPartOfSearchTerm || isOptionInPersonalDetails;
            });
        }

        sectionsArr.push({
            title: undefined,
            data: filterSelectedOptions,
            shouldShow: true,
            indexOffset,
        });
        indexOffset += filterSelectedOptions.length;

        // Filtering out selected users from the search results
        const selectedLogins = selectedOptions.map(({login}) => login);
        const personalDetailsWithoutSelected = Object.values(personalDetails).filter(({login}) => !selectedLogins.some((selectedLogin) => selectedLogin === login));
        const personalDetailsFormatted = personalDetailsWithoutSelected.map((item) => OptionsListUtils.formatMemberForList(item));

        sectionsArr.push({
            title: translate('common.contacts'),
            data: personalDetailsFormatted,
            shouldShow: !isEmptyObject(personalDetailsFormatted),
            indexOffset,
        });
        indexOffset += personalDetailsFormatted.length;

        Object.values(usersToInvite).forEach((userToInvite) => {
            const hasUnselectedUserToInvite = !selectedLogins.some((selectedLogin) => selectedLogin === userToInvite.login);

            if (hasUnselectedUserToInvite) {
                sectionsArr.push({
                    title: undefined,
                    data: [OptionsListUtils.formatMemberForList(userToInvite)],
                    shouldShow: true,
                    indexOffset: indexOffset++,
                });
            }
        });

        return sectionsArr;
    }, [personalDetails, searchTerm, selectedOptions, usersToInvite, translate, didScreenTransitionEnd]);

    const toggleOption = (option: MemberForList) => {
        Policy.clearErrors(route.params.policyID);

        const isOptionInList = selectedOptions.some((selectedOption) => selectedOption.login === option.login);

        let newSelectedOptions: MemberForList[];
        if (isOptionInList) {
            newSelectedOptions = selectedOptions.filter((selectedOption) => selectedOption.login !== option.login);
        } else {
            newSelectedOptions = [...selectedOptions, {...option, isSelected: true}];
        }

        setSelectedOptions(newSelectedOptions);
    };

    const validate = (): boolean => {
        const errors: Errors = {};
        if (selectedOptions.length <= 0) {
            errors.noUserSelected = 'true';
        }

        Policy.setWorkspaceErrors(route.params.policyID, errors);
        return isEmptyObject(errors);
    };

    const inviteUser = () => {
        if (!validate()) {
            return;
        }

        const invitedEmailsToAccountIDs: InvitedEmailsToAccountIDs = {};
        selectedOptions.forEach((option) => {
            const login = option.login ?? '';
            const accountID = option.accountID ?? '';
            if (!login.toLowerCase().trim() || !accountID) {
                return;
            }
            invitedEmailsToAccountIDs[login] = Number(accountID);
        });
        Policy.setWorkspaceInviteMembersDraft(route.params.policyID, invitedEmailsToAccountIDs);
        Navigation.navigate(ROUTES.WORKSPACE_INVITE_MESSAGE.getRoute(route.params.policyID));
    };

    const [policyName, shouldShowAlertPrompt] = useMemo(() => [policy?.name ?? '', !isEmptyObject(policy?.errors) || !!policy?.alertMessage], [policy]);

    const headerMessage = useMemo(() => {
        const searchValue = searchTerm.trim().toLowerCase();
        if (usersToInvite.length === 0 && CONST.EXPENSIFY_EMAILS.some((email) => email === searchValue)) {
            return translate('messages.errorMessageInvalidEmail');
        }
        if (
            usersToInvite.length === 0 &&
            excludedUsers.includes(
                parsePhoneNumber(LoginUtils.appendCountryCode(searchValue)).possible ? OptionsListUtils.addSMSDomainIfPhoneNumber(LoginUtils.appendCountryCode(searchValue)) : searchValue,
            )
        ) {
            return translate('messages.userIsAlreadyMember', {login: searchValue, name: policyName});
        }
        return OptionsListUtils.getHeaderMessage(personalDetails.length !== 0, usersToInvite.length > 0, searchValue);
    }, [excludedUsers, translate, searchTerm, policyName, usersToInvite, personalDetails.length]);

    return (
        <ScreenWrapper
            shouldEnableMaxHeight
            testID={WorkspaceInvitePage.displayName}
        >
            <FullPageNotFoundView
                shouldShow={(isEmptyObject(policy) && !isLoadingReportData) || !PolicyUtils.isPolicyAdmin(policy) || PolicyUtils.isPendingDeletePolicy(policy)}
                subtitleKey={isEmptyObject(policy) ? undefined : 'workspace.common.notAuthorized'}
                onBackButtonPress={() => Navigation.goBack(ROUTES.SETTINGS_WORKSPACES)}
            >
                <HeaderWithBackButton
                    title={translate('workspace.invite.invitePeople')}
                    subtitle={policyName}
                    shouldShowGetAssistanceButton
                    guidesCallTaskID={CONST.GUIDES_CALL_TASK_IDS.WORKSPACE_MEMBERS}
                    onBackButtonPress={() => {
                        Policy.clearErrors(route.params.policyID);
                        Navigation.goBack();
                    }}
                />
                <SelectionList
                    canSelectMultiple
                    sections={sections}
                    textInputLabel={translate('optionsSelector.nameEmailOrPhoneNumber')}
                    textInputValue={searchTerm}
                    onChangeText={(value) => {
                        SearchInputManager.searchInput = value;
                        setSearchTerm(value);
                    }}
                    headerMessage={headerMessage}
                    onSelectRow={toggleOption}
                    onConfirm={inviteUser}
                    showScrollIndicator
                    showLoadingPlaceholder={!didScreenTransitionEnd || !OptionsListUtils.isPersonalDetailsReady(personalDetailsProp)}
                    shouldPreventDefaultFocusOnSelectRow={!DeviceCapabilities.canUseTouchScreen()}
                />
                <View style={[styles.flexShrink0]}>
                    <FormAlertWithSubmitButton
                        isDisabled={!selectedOptions.length}
                        isAlertVisible={shouldShowAlertPrompt}
                        buttonText={translate('common.next')}
                        onSubmit={inviteUser}
                        message={[policy?.alertMessage ?? '', {isTranslated: true}]}
                        containerStyles={[styles.flexReset, styles.flexGrow0, styles.flexShrink0, styles.flexBasisAuto, styles.mb5]}
                        enabledWhenOffline
                        disablePressOnEnter
                    />
                </View>
            </FullPageNotFoundView>
        </ScreenWrapper>
    );
}

WorkspaceInvitePage.displayName = 'WorkspaceInvitePage';

export default withPolicyAndFullscreenLoading(
    withOnyx<WorkspaceInvitePageProps, WorkspaceInvitePageOnyxProps>({
        personalDetails: {
            key: ONYXKEYS.PERSONAL_DETAILS_LIST,
        },
        betas: {
            key: ONYXKEYS.BETAS,
        },
        invitedEmailsToAccountIDsDraft: {
            key: ({route}) => `${ONYXKEYS.COLLECTION.WORKSPACE_INVITE_MEMBERS_DRAFT}${route.params.policyID.toString()}`,
        },
    })(WorkspaceInvitePage),
);
